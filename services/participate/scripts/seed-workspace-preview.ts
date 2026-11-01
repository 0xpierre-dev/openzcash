import { randomUUID } from "node:crypto";
import { hashPassword } from "../lib/auth/password";
import { db } from "../lib/db";
import { recordTreasuryFunding, allocateTreasuryFunds } from "../lib/services/treasuries";
import { createCommunityProposal } from "../lib/services/proposal-discussion";

// This fixture is confined to a disposable loopback database. It never sends
// Zcash, creates a real payment receipt, or delivers a voter invitation.
const expectedDatabase = "postgresql://dao_test@127.0.0.1:55438/community_workspace";
if (process.env.DATABASE_URL !== expectedDatabase || process.env.WORKSPACE_PREVIEW !== "true" || process.env.NODE_ENV === "production") {
  throw new Error("Workspace fixtures require the dedicated local preview database");
}

async function seed() {
  if (await db.community.findUnique({ where: { id: "preview_orchard" } })) {
    console.log("Preview community already exists; existing records preserved.");
    return;
  }
  const passwordHash = await hashPassword("preview-local-only");
  for (const [id, nick] of [["preview_maya", "maya.preview"], ["preview_leo", "leo.preview"], ["preview_ava", "ava.preview"]]) {
    await db.user.create({ data: { id, nick, role: "USER", passwordHash } });
  }
  await db.community.create({ data: {
    id: "preview_orchard", name: "Orchard Collective", slug: "orchard-collective", createdById: "preview_maya",
    memberships: { create: [
      { userId: "preview_maya", role: "OWNER" },
      { userId: "preview_ava", role: "MANAGER" }
    ] }
  } });
  await db.community.create({ data: {
    id: "preview_river", name: "River Commons", slug: "river-commons", createdById: "preview_maya",
    memberships: { create: { userId: "preview_maya", role: "OWNER" } }
  } });
  await db.daoMember.createMany({ data: Array.from({ length: 12 }, (_, index) => ({
    communityId: "preview_orchard", nick: `member-${index + 1}`, signalUsername: `preview.member${index + 1}.42`
  })) });
  await recordTreasuryFunding("preview_orchard", "preview_maya", {
    treasuryKind: "COMMUNITY", amountZec: "240", fundingSource: "Sample community contributions",
    reason: "Opening allocation for this local sample community", idempotencyKey: randomUUID()
  });
  const result = await allocateTreasuryFunds("preview_orchard", "preview_maya", {
    fromTreasuryKind: "COMMUNITY", toTreasuryKind: "SUSTAINABILITY", amountZec: "60",
    reason: "Set aside a reserve for ongoing community costs", idempotencyKey: randomUUID()
  });
  const communityFund = result.treasuries.funds.find(f => f.kind === "COMMUNITY")!;
  const reserveFund = result.treasuries.funds.find(f => f.kind === "SUSTAINABILITY")!;
  // Illustrative USD budgets; these are not conversions of prior ZEC examples.
  const now = Date.now();
  const proposals = [
    {
      title: "Bring the community together for our next meetup",
      body: "A small gathering, with room for new people.\n\nWe propose an afternoon meetup with two practical sessions: getting started with shielded payments, and helping newcomers take part in community decisions.\n\nThe requested 1,800 USD covers a venue, accessibility support, and learning materials. Two volunteers will coordinate the event and share a short report with attendance, actual costs, and lessons learned.\n\nSuccess means at least 20 participants, an accessible venue, and a clear next step for everyone who wants to stay involved.",
      treasuryId: communityFund.id!, requestedAmountUsd: "1800", status: "OPEN" as const
    },
    {
      title: "Keep our shared community tools running",
      body: "Renew the community website, discussion tools, and shared documentation for the next quarter.\n\nThe sustainability reserve would cover 600 USD in recorded costs. The coordinator will attach the invoices and report the actual amount paid. Any unspent allocation stays in the reserve.\n\nThis request keeps our existing tools available while we review usage before the next renewal.",
      treasuryId: reserveFund.id!, requestedAmountUsd: "600", status: "SCHEDULED" as const
    },
    {
      title: "Create a welcoming handbook for new members",
      body: "Let’s make it easier to join the community.\n\nA short handbook will explain how to introduce yourself, take part in discussions, write a proposal, and ask for help. Volunteers will start with an English edition, then invite translations.\n\nThis proposal requests community feedback and volunteer time. No treasury funding is requested.",
      status: "DRAFT" as const
    },
    {
      title: "Support a hands-on privacy workshop",
      body: "Run a practical workshop on everyday privacy and safe wallet use.\n\nThe 2,400 USD request would cover facilitation, printed materials, and venue access. The organizers will publish a delivery report before requesting another allocation.\n\nThis sample proposal demonstrates how a closed discussion remains available for reference. No payment has been made.",
      treasuryId: communityFund.id!, requestedAmountUsd: "2400", status: "CLOSED" as const
    }
  ];
  for (const [index, input] of proposals.entries()) {
    const draft = await createCommunityProposal("preview_orchard", "preview_maya", {
      title: input.title, body: input.body,
      treasuryId: input.treasuryId, requestedAmountUsd: input.requestedAmountUsd,
      opensAt: new Date(input.status === "OPEN" ? now - 86400000 : input.status === "CLOSED" ? now - 10 * 86400000 : now + (index + 1) * 86400000).toISOString(),
      closesAt: new Date(input.status === "CLOSED" ? now - 2 * 86400000 : now + (index + 8) * 86400000).toISOString()
    });
    // Fixture states are illustrative; no anchor, ballot or payment is fabricated.
    await db.poll.update({ where: { id: draft.id }, data: {
      status: input.status,
      createdAt: new Date(now - (index + 1) * 86400000)
    } });
    await db.pollEligibility.create({ data: { pollId: draft.id, userId: "preview_leo" } });
    if (index === 0) {
      const comment = await db.pollComment.create({ data: {
        pollId: draft.id, authorUserId: "preview_leo", authorLabel: "leo.preview",
        body: "Could we make the introductory session accessible to people who have never used a wallet? A short checklist beforehand would help.",
        createdAt: new Date(now - 4 * 3600000)
      } });
      await db.pollComment.create({ data: {
        pollId: draft.id, parentId: comment.id, authorUserId: "preview_maya", authorLabel: "maya.preview",
        body: "Yes. We’ll share a simple preparation guide and have volunteers available before the first session.",
        createdAt: new Date(now - 3 * 3600000)
      } });
    }
  }
  console.log("Local sample workspace prepared at /communities/preview_orchard. No funds or invitations sent.");
}

seed().finally(() => db.$disconnect());
