// @vitest-environment node
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { env as processEnvironment } from "node:process";
import { PrismaClient } from "@prisma/client";
import { decisionPackage, signingKey } from "@/tests/helpers/signed-decision";

// Run against a fresh local participate_demo_test database with db:setup applied.
// The suite creates only synthetic accounts/proposals and refuses existing users.
//   PARTICIPATE_DEMO_TEST_DATABASE_URL=postgresql://<user>@localhost:5432/participate_demo_test npx vitest run tests/integration/demo-committee-postgres.test.ts
const databaseUrl = processEnvironment.PARTICIPATE_DEMO_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/participate_demo_test"
  )
    throw new Error("Only the local participate_demo_test copy is permitted");
}
const prisma = new PrismaClient({
  datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused",
});
vi.mock("@/lib/db", () => ({ db: prisma }));
const { resetDemoEnvironmentCache } = await import("@/lib/demo/environment");
const { joinDemoCommittee, scopeDemoWorkspace, readDemoStatus, DEMO_SEAT_IDS } =
  await import("@/lib/demo/seats");
const { fillDemoSeats } = await import("@/lib/demo/fill");
const { resetDemoTester } = await import("@/lib/demo/reset");
const { startPracticeRound } = await import("@/lib/demo/practice");
const {
  createDecisionRound,
  beginDecisionSignature,
  finishDecisionSignature,
  readDecisionReceipt,
} = await import("@/lib/services/signed-decisions");
const { readCommitteeWorkspace, mutateCommittee } =
  await import("@/lib/services/committee");
const { verifyDecisionReceipt } = await import("@/lib/decisions/verify");
const { COMMITTEE_LABELS } = await import("@/lib/domain/committee-labels");
const { publishArchiveRevision } = await import("@/lib/services/proposal-archives");

async function prepareDemoFixture() {
  if (await prisma.user.count())
    throw new Error("Demo tests require a fresh participate_demo_test database with no accounts");
  const owner = await prisma.user.create({
    data: { nick: "demo-fixture-owner", role: "USER", passwordHash: "!disabled" },
  });
  const host = await prisma.community.create({
    data: { name: "Synthetic demo host", slug: "demo-test-host", createdById: owner.id },
  });
  const committee = await prisma.community.create({
    data: { name: "Synthetic demo committee", slug: "demo-test-committee", kind: "COMMITTEE", createdById: owner.id },
  });
  for (let i = 1; i <= 3; i++) {
    const proposal = await decisionPackage(`demo-test-proposal-${i}`);
    await publishArchiveRevision(host.id, proposal.bundle, proposal.manifestHash, committee.id);
  }
  const url = new URL(databaseUrl!);
  execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-v", `host=${host.id}`, "-f",
    fileURLToPath(new URL("../../scripts/demo/participate-demo.sql", import.meta.url))], {
    env: { ...processEnvironment, PGHOST: url.hostname, PGPORT: url.port || "5432",
      PGDATABASE: "participate_demo_test", PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password) },
    stdio: "pipe",
  });
  return host.id;
}

const context = { origin: "http://localhost:4421", rpId: "localhost" };
const demoEnv = {
  PARTICIPATE_DEMO_ENVIRONMENT: "true",
  PARTICIPATE_COMMITTEE_ENABLED: "true",
  PARTICIPATE_PUBLIC_DEMO: "false",
  DATABASE_URL: databaseUrl ?? "",
  APP_BASE_URL: context.origin,
  PASSKEY_ORIGIN: context.origin,
  PARTICIPATE_PARENT_ORIGIN: context.origin,
};

async function tester() {
  const signer = await signingKey();
  const user = await prisma.user.create({
    data: {
      nick: `demo-tester-${randomUUID()}`,
      email: `tester-${randomUUID()}@example.test`,
      emailVerifiedAt: new Date(),
      role: "USER",
      passwordHash: "",
    },
  });
  await prisma.passkey.create({
    data: {
      userId: user.id,
      credentialId: signer.credential.id,
      userHandle: signer.userHandle,
      rpId: context.rpId,
      publicKey: signer.credential.publicKey,
      transports: ["internal"],
      deviceType: "singleDevice",
      backedUp: false,
      label: "Tester test key",
    },
  });
  return { ...signer, user };
}

async function openRound(hostId: string, userId: string) {
  const archives = await prisma.proposalArchive.findMany({
    where: { communityId: hostId, abandonment: null, revisions: { some: {} } },
    include: {
      revisions: {
        orderBy: { revision: "desc" },
        take: 1,
        include: { decision: true },
      },
    },
    orderBy: { recordId: "asc" },
  });
  for (const archive of archives) {
    const revision = archive.revisions[0];
    if (revision.decision) continue;
    try {
      return {
        recordId: archive.recordId,
        revision: revision.revision,
        archiveId: archive.id,
        ...(await createDecisionRound(
          hostId,
          archive.recordId,
          userId,
          { revision: revision.revision, policy: "ZCG_MAJORITY" },
          context,
        )),
      };
    } catch (error) {
      if (
        !["PROPOSAL_SOURCE_WITHDRAWN", "PROPOSAL_ABANDONED"].includes(
          (error as { code?: string }).code ?? "",
        )
      )
        throw error;
    }
  }
  throw new Error("No open proposal in the demo copy");
}

describe.skipIf(!databaseUrl)("Committee demo in PostgreSQL", () => {
  let hostId = "";
  beforeAll(async () => {
    hostId = await prepareDemoFixture();
  });
  beforeEach(() => {
    for (const [name, value] of Object.entries(demoEnv))
      vi.stubEnv(name, value);
    resetDemoEnvironmentCache();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetDemoEnvironmentCache();
  });
  afterAll(() => prisma.$disconnect());

  it("seats a tester, completes a round with labelled TEST ballots and resets it", async () => {
    const me = await tester(),
      other = await tester();
    expect(await joinDemoCommittee(hostId, me.user.id, context)).toEqual({
      joined: true,
    });
    expect(await joinDemoCommittee(hostId, other.user.id, context)).toEqual({
      joined: true,
    });
    const workspace = await scopeDemoWorkspace(
      await readCommitteeWorkspace(hostId, me.user.id, context),
      hostId,
      me.user.id,
    );
    expect(workspace).toMatchObject({
      access: "MEMBER",
      role: "MANAGER",
      canMutate: true,
    });
    expect(workspace.members.map((m) => m.name).sort()).toEqual(
      [
        "Test seat 2",
        "Test seat 3",
        "Test seat 4",
        "Test seat 5",
        expect.stringMatching(/^Demo tester /),
      ].sort(),
    );
    expect(workspace.members.every((m) => m.ready || !m.isMe)).toBe(true);

    const anchorsBefore = await prisma.archiveAnchor.count();
    const round = await openRound(hostId, me.user.id);
    const voters = await prisma.signedDecisionVoter.findMany({
      where: { roundId: round.id },
    });
    expect(voters.map((v) => v.userId).sort()).toEqual(
      [...DEMO_SEAT_IDS, me.user.id].sort(),
    );
    await expect(
      fillDemoSeats(hostId, round.recordId, other.user.id, "SPLIT"),
    ).rejects.toMatchObject({ code: "DEMO_NOT_YOUR_ROUND" });
    expect(
      (await readDemoStatus(hostId, other.user.id))?.otherTesterRecords,
    ).toContain(round.recordId);

    const ceremony = await beginDecisionSignature(
      hostId,
      round.recordId,
      round.id,
      me.user.id,
      {
        choice: "APPROVE",
        rationale: "Demo tester vote: approving to see the result.",
      },
      context,
    );
    await finishDecisionSignature(
      hostId,
      round.recordId,
      round.id,
      me.user.id,
      ceremony.ceremonyId,
      me.authenticator.authentication(
        ceremony.options.challenge,
        me.userHandle,
        { origin: context.origin },
      ),
      context,
    );
    const filled = await fillDemoSeats(
      hostId,
      round.recordId,
      me.user.id,
      "SPLIT",
    );
    expect(filled.signed.map((s) => s.choice)).toEqual([
      "APPROVE",
      "APPROVE",
      "REJECT",
      "REJECT",
    ]);
    const receipt = await readDecisionReceipt(hostId, round.recordId, round.id);
    expect(await verifyDecisionReceipt(receipt)).toMatchObject({
      signed: 5,
      approve: 3,
      reject: 2,
      outcome: "APPROVED",
    });
    expect(
      receipt.ballots.filter(
        (b) =>
          "rationale" in b.envelope &&
          b.envelope.rationale.startsWith("Demo test ballot."),
      ).length,
    ).toBe(4);
    expect(
      await prisma.archiveActivityEvent.count({
        where: {
          archiveId: round.archiveId,
          sourceKey: `review-decided:${round.id}`,
        },
      }),
    ).toBe(1);
    // Nothing new is anchored: the demo has no anchoring worker.
    expect(await prisma.archiveAnchor.count()).toBe(anchorsBefore);
    await expect(
      fillDemoSeats(hostId, round.recordId, me.user.id, "SPLIT"),
    ).resolves.toEqual({ signed: [], remaining: 0 });

    const archive = await prisma.proposalArchive.findUniqueOrThrow({
      where: { id: round.archiveId },
    });
    await mutateCommittee(hostId, me.user.id, {
      action: "labels",
      recordId: round.recordId,
      version: archive.labelsVersion,
      labels: [COMMITTEE_LABELS[0].id],
    });
    const history = await scopeDemoWorkspace(
      await readCommitteeWorkspace(hostId, me.user.id, context),
      hostId,
      me.user.id,
    );
    expect(history.history.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        "PROPOSAL_LABELS_SET",
        "DECISION_SIGNED",
        "REVIEW_OPENED",
        "MEMBER_JOINED",
      ]),
    );
    const otherView = await scopeDemoWorkspace(
      await readCommitteeWorkspace(hostId, other.user.id, context),
      hostId,
      other.user.id,
    );
    expect(
      otherView.history.some(
        (e) =>
          e.action === "REVIEW_OPENED" || e.action === "PROPOSAL_LABELS_SET",
      ),
    ).toBe(false);

    expect(await resetDemoTester(hostId, me.user.id)).toEqual({
      rounds: 1,
      proposals: 1,
      kept: 0,
    });
    expect(
      await prisma.signedDecisionRound.count({ where: { id: round.id } }),
    ).toBe(0);
    expect(
      await prisma.archiveActivityEvent.count({
        where: {
          archiveId: round.archiveId,
          sourceKey: `review-decided:${round.id}`,
        },
      }),
    ).toBe(0);
    const restored = await prisma.proposalArchive.findUniqueOrThrow({
      where: { id: round.archiveId },
    });
    expect({
      labels: restored.labels,
      labelsVersion: restored.labelsVersion,
    }).toEqual({
      labels: archive.labels,
      labelsVersion: archive.labelsVersion,
    });
    const afterReset = await scopeDemoWorkspace(
      await readCommitteeWorkspace(hostId, me.user.id, context),
      hostId,
      me.user.id,
    );
    expect(afterReset.history).toEqual([]);
    // The same revision can be reviewed again after a reset.
    const again = await createDecisionRound(
      hostId,
      round.recordId,
      me.user.id,
      { revision: round.revision, policy: "ZCG_MAJORITY" },
      context,
    );
    expect(again.id).not.toBe(round.id);
    await resetDemoTester(hostId, me.user.id);
    await resetDemoTester(hostId, other.user.id);
  });

  it("keeps a decided round when someone else's activity follows it, so no event points at a deleted round", async () => {
    const me = await tester(), other = await tester();
    await joinDemoCommittee(hostId, me.user.id, context);
    await joinDemoCommittee(hostId, other.user.id, context);
    const round = await openRound(hostId, me.user.id);
    await fillDemoSeats(hostId, round.recordId, me.user.id, "REJECT");
    const ceremony = await beginDecisionSignature(hostId, round.recordId, round.id, me.user.id, { choice: "REJECT", rationale: "Demo tester vote: rejecting in this practice run." }, context);
    await finishDecisionSignature(hostId, round.recordId, round.id, me.user.id, ceremony.ceremonyId, me.authenticator.authentication(ceremony.options.challenge, me.userHandle, { origin: context.origin }), context);
    // Many fills in a row do not trip the shared TEST seat signing throttle.
    expect(await prisma.passkeyThrottle.count({ where: { id: { startsWith: "decision:demo_seat_" }, attempts: { gt: 10 } } })).toBe(0);
    const archive = await prisma.proposalArchive.findUniqueOrThrow({ where: { id: round.archiveId } });
    await mutateCommittee(hostId, other.user.id, { action: "labels", recordId: round.recordId, version: archive.labelsVersion, labels: [COMMITTEE_LABELS[1].id] });
    const before = await prisma.archiveActivityEvent.count({ where: { archiveId: round.archiveId } });
    expect(await resetDemoTester(hostId, me.user.id)).toEqual({ rounds: 0, proposals: 0, kept: 1 });
    expect(await prisma.signedDecisionRound.count({ where: { id: round.id } })).toBe(1);
    expect(await prisma.archiveActivityEvent.count({ where: { archiveId: round.archiveId } })).toBe(before);
    expect((await prisma.proposalArchive.findUniqueOrThrow({ where: { id: round.archiveId } })).labels).toEqual([COMMITTEE_LABELS[1].id]);
    // The other tester can still undo their own tags, which then frees the first tester's reset.
    expect(await resetDemoTester(hostId, other.user.id)).toMatchObject({ rounds: 0, kept: 0 });
    expect(await resetDemoTester(hostId, me.user.id)).toEqual({ rounds: 1, proposals: 1, kept: 0 });
  });

  it("guides a tester through a practice round: open, resume, fill seat by seat, try another, reset", async () => {
    const me = await tester();
    await joinDemoCommittee(hostId, me.user.id, context);
    const first = await startPracticeRound(hostId, me.user.id, context);
    expect(first).toMatchObject({ signed: 0, eligible: 5, complete: false });
    expect(await startPracticeRound(hostId, me.user.id, context)).toMatchObject({ roundId: first.roundId });
    const ceremony = await beginDecisionSignature(hostId, first.recordId, first.roundId, me.user.id, { choice: "APPROVE", rationale: "Demo tester vote: approving in this practice run." }, context);
    await finishDecisionSignature(hostId, first.recordId, first.roundId, me.user.id, ceremony.ceremonyId, me.authenticator.authentication(ceremony.options.challenge, me.userHandle, { origin: context.origin }), context);
    for (let left = 3; left >= 0; left--) expect(await fillDemoSeats(hostId, first.recordId, me.user.id, "SPLIT", 1)).toMatchObject({ remaining: left });
    const done = await startPracticeRound(hostId, me.user.id, context);
    expect(done).toMatchObject({ roundId: first.roundId, signed: 5, complete: true });
    const next = await startPracticeRound(hostId, me.user.id, context, true);
    expect(next.roundId).not.toBe(first.roundId);
    expect(next.recordId).not.toBe(first.recordId);
    expect(await resetDemoTester(hostId, me.user.id)).toMatchObject({ rounds: 2, kept: 0 });
  });

  it("refuses demo actions and keeps records immutable when the database is not a demo database", async () => {
    // Create our own protected record; prior tests deliberately reset theirs.
    const me = await tester();
    await joinDemoCommittee(hostId, me.user.id, context);
    const round = await openRound(hostId, me.user.id);
    await fillDemoSeats(hostId, round.recordId, me.user.id, "SPLIT");
    vi.stubEnv("DATABASE_URL", "postgresql://app@localhost:5432/participate");
    resetDemoEnvironmentCache();
    await expect(
      fillDemoSeats(hostId, "any", "any", "SPLIT"),
    ).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
    await expect(resetDemoTester(hostId, "any")).rejects.toMatchObject({
      code: "DEMO_UNAVAILABLE",
    });
    vi.stubEnv("PARTICIPATE_DEMO_ENVIRONMENT", "");
    resetDemoEnvironmentCache();
    expect(await joinDemoCommittee(hostId, "any", context)).toEqual({
      joined: false,
    });
    // Without the transaction-local reset flag the demo database still refuses deletes.
    await expect(prisma.signedDecisionBallot.deleteMany({ where: { roundId: round.id } })).rejects.toThrow(
      /append-only/,
    );
  });
});
