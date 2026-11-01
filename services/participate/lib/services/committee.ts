import { committeeOperationsEnabled } from "@/lib/auth/committee-policy";
import { verifyCommitteePreview } from "@/lib/auth/committee-admin";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isDemoAccount } from "@/lib/auth/email-policy";
import type { PasskeyContext } from "@/lib/auth/passkey-policy";
import { emailDeliveryAvailable } from "@/lib/services/email-delivery";
import { committeeAction, committeePermissions, reviewerRoles, type CommitteeWorkspace } from "@/lib/domain/committee";
import { archiveManifestSchema } from "@/lib/archive/format";
import { readSourceDecision } from "@/lib/archive/source-decision";
import { ballotSchema, roundSchema, tallyDecisions } from "@/lib/decisions/format";
import { appendCommitteeEvent, committeeActor, CommitteeError, lockCommittee, resolveCommittee } from "./committee-access";
import { COMMITTEE_LABEL_CATALOG, selectedCommitteeLabels } from "@/lib/domain/committee-labels";
import { appendArchiveActivity, initializeArchiveActivity } from "./archive-activity";
import { lockProposalArchive, isLifecycleConflict } from "./proposal-lifecycle";
import { zcgSourceWithdrawal } from "@/lib/data/zcg-source-metadata";

const fail = (code: string, status = 409): never => { throw new CommitteeError(code, status); };
const memberLabel = (row: { publicName: string | null; user: { nick: string; displayName: string | null } }) => row.publicName || row.user.displayName || row.user.nick;

export async function readCommitteeWorkspace(hostId: string, userId: string | undefined, context: PasskeyContext | null, before?: number, previewToken?: string): Promise<CommitteeWorkspace> {
  const preview = await verifyCommitteePreview(userId, hostId, previewToken);
  const restricted = !committeeOperationsEnabled();
  const empty: CommitteeWorkspace = { access: restricted ? "RESTRICTED" : userId ? "DENIED" : "SIGNED_OUT", name: "Committee", role: null, demo: preview || Boolean(userId && isDemoAccount(userId)), canMutate: false,
    emailReady: emailDeliveryAvailable(), permissions: committeePermissions(null), rules: { quorum: 5, approvalPercent: 60, durationHours: null, version: 0 }, members: [], invitations: [], queue: [], history: [], historyBefore: null };
  if (!userId || (restricted && !preview)) return empty;
  return db.$transaction(async tx => {
    const scope = await resolveCommittee(tx, hostId), actor = await committeeActor(tx, scope.id, userId);
    if (!actor.user) return empty;
    const invitationWhere = { communityId: scope.id, ...(actor.permissions.canManageTeam && !empty.demo ? {} : { email: actor.canMutate ? actor.user.email!.toLowerCase() : "" }) };
    const invitations = preview ? [] : await tx.committeeInvitation.findMany({ where: invitationWhere, orderBy: { createdAt: "desc" }, take: 100 });
    const mine = invitations.filter(invite => actor.canMutate && invite.email === actor.user!.email!.toLowerCase() && !invite.revokedAt && !invite.acceptedAt && invite.expiresAt > new Date());
    if (!preview && !actor.role && !mine.length) return empty;
    const base = { ...empty, name: scope.name, role: preview ? null : actor.role, canMutate: !preview && actor.canMutate, permissions: preview ? committeePermissions(null) : actor.permissions,
      invitations: (actor.role ? invitations : mine).map(invite => ({ id: invite.id, email: invite.email, role: invite.role as "MANAGER" | "REVIEWER" | "MODERATOR", expiresAt: invite.expiresAt.toISOString(),
        state: invite.revokedAt ? "REVOKED" as const : invite.acceptedAt ? "ACCEPTED" as const : invite.expiresAt <= new Date() ? "EXPIRED" as const : "PENDING" as const, mine: mine.some(row => row.id === invite.id) })) };
    if (!preview && !actor.role) return { ...base, access: "INVITED" };
    const members = await tx.communityMembership.findMany({ where: { communityId: scope.id }, include: { user: { include: { passkeys: { where: { revokedAt: null, rpId: context?.rpId ?? "" }, select: { id: true } } } } }, orderBy: [{ status: "asc" }, { role: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
    const voting = members.filter(m => m.status === "ACTIVE" && reviewerRoles.includes(m.role));
    const policy = await tx.committeePolicy.findUnique({ where: { communityId: scope.id } });
    const archives = await tx.proposalArchive.findMany({ where: { committeeId: scope.id, communityId: hostId, revisions: { some: {} } }, orderBy: { createdAt: "desc" },
      include: { abandonment: true, revisions: { orderBy: { revision: "desc" }, take: 1, include: { decision: { include: { ballots: true, voters: { where: { userId }, select: { id: true } } } } } } } });
    const queue = await Promise.all(archives.map(async archive => {
      const revision = archive.revisions[0], saved = revision.decision;
      const bundle = JSON.parse(revision.packageJson);
      const manifest = archiveManifestSchema.parse(JSON.parse(bundle.manifest));
      // An unavailable source never falls back to invented votes or the current pilot roster.
      const sourceDecision = manifest.kind === "HISTORICAL_SUMMARY" ? await readSourceDecision(bundle, revision.manifestHash).catch(() => null) : null;
      const sourceWithdrawal = zcgSourceWithdrawal(manifest);
      const round = saved ? roundSchema.parse(JSON.parse(saved.manifestJson)) : null;
      const ballots = saved?.ballots.map(row => ballotSchema.parse(JSON.parse(row.ballotJson))) ?? [];
      const tally = round ? tallyDecisions(round, ballots, round.closesAt !== null && Date.now() >= Date.parse(round.closesAt)) : null;
      const voter = saved?.voters[0], myChoice = ballots.find(b => b.envelope.voterId === voter?.id)?.envelope.choice ?? null;
      return { recordId: archive.recordId, hostId, title: manifest.title, revision: revision.revision, kind: manifest.kind, labels: archive.labels, labelsVersion: archive.labelsVersion, sourceDecision, sourceWithdrawal,
        state: archive.abandonment || sourceWithdrawal ? "ABANDONED" : tally?.outcome ?? (manifest.kind === "HISTORICAL_SUMMARY" ? "HISTORICAL" : "AWAITING_REVIEW"), roundId: saved?.id ?? null, closesAt: saved?.closesAt?.toISOString() ?? null,
        signed: tally?.signed ?? 0, eligible: tally?.eligible ?? voting.length, myChoice, myPending: Boolean(!archive.abandonment && !sourceWithdrawal && voter && !myChoice && tally?.outcome === "OPEN") };
    }));
    const events = empty.demo ? [] : await tx.committeeEvent.findMany({ where: { communityId: scope.id, ...(before ? { sequence: { lt: before } } : {}) }, orderBy: { sequence: "desc" }, take: 51 });
    const names = new Map(members.map(m => [m.userId, memberLabel(m)]));
    return { ...base, access: "MEMBER", rules: { ...empty.rules, version: policy?.version ?? 0 },
      members: members.map(m => ({ id: m.id, name: memberLabel(m), avatar: m.user.shareProfileInDiscussion ? m.user.avatarUrl : null,
        email: !empty.demo && (actor.permissions.canManageTeam || m.userId === userId) ? m.user.email : null, role: m.role, status: m.status, version: m.version, isMe: m.userId === userId,
        emailVerified: Boolean(m.user.emailVerifiedAt), keyCount: m.user.passkeys.length, ready: Boolean(m.user.status === "ACTIVE" && !isDemoAccount(m.userId) && m.user.emailVerifiedAt && m.user.email && m.user.passkeys.length && m.user.passkeys.length <= 10) })),
      queue, history: events.slice(0, 50).map(event => ({ id: event.id, sequence: event.sequence, action: event.action, actor: names.get(event.actorId) ?? "Former member",
        summary: event.action === "DECISION_SIGNED" ? "Signed response recorded. See the completed review for choices and reasons." : typeof (event.details as Record<string, unknown>)?.summary === "string" ? String((event.details as Record<string, unknown>).summary) : event.action.replaceAll("_", " ").toLowerCase(), createdAt: event.createdAt.toISOString(), hash: event.hash })),
      historyBefore: events.length > 50 ? events[49].sequence : null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}

export async function mutateCommittee(hostId: string, userId: string, input: unknown) {
  if (!committeeOperationsEnabled()) return fail("COMMITTEE_NOT_ENABLED", 403);
  const data = committeeAction.parse(input);
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(async tx => {
      const scope = await resolveCommittee(tx, hostId);
      // Same archive -> committee order as review opening and author abandonment.
      const labelArchive = data.action === "labels" ? await tx.proposalArchive.findFirst({ where: { communityId: hostId, committeeId: scope.id, recordId: data.recordId, revisions: { some: {} } } }) : null;
      if (labelArchive) await lockProposalArchive(tx, labelArchive.id);
      await lockCommittee(tx, scope.id);
      const actor = await committeeActor(tx, scope.id, userId);
      if (!actor.canMutate) return fail("COMMITTEE_VERIFIED_ACCOUNT_REQUIRED", 403);
      if (data.action !== "accept" && !(data.action === "labels" ? actor.permissions.canReview : data.action === "policy" ? actor.permissions.canOpen : actor.permissions.canManageTeam)) return fail("COMMITTEE_FORBIDDEN", 403);
      const now = new Date(), throttleId = `committee:${userId}`;
      const throttle = await tx.passkeyThrottle.findUnique({ where: { id: throttleId } });
      if (throttle && throttle.resetsAt > now && throttle.attempts >= 30) return fail("COMMITTEE_RATE_LIMITED", 429);
      await tx.passkeyThrottle.upsert({ where: { id: throttleId }, create: { id: throttleId, attempts: 1, resetsAt: new Date(+now + 600000) },
        update: { attempts: throttle && throttle.resetsAt > now ? throttle.attempts + 1 : 1, resetsAt: throttle && throttle.resetsAt > now ? throttle.resetsAt : new Date(+now + 600000) } });
      if (data.action === "labels") {
        const archive = labelArchive;
        if (!archive) return fail("COMMITTEE_PROPOSAL_UNAVAILABLE", 404);
        if (archive.labelsVersion !== data.version) return fail("COMMITTEE_REFRESH_REQUIRED");
        if (JSON.stringify(archive.labels) === JSON.stringify(data.labels)) return { labels: archive.labels, labelsVersion: archive.labelsVersion };
        // Metadata never edits the preserved application or changes a signed outcome.
        const labelsVersion = archive.labelsVersion + 1;
        await initializeArchiveActivity(tx, archive);
        const labels = selectedCommitteeLabels(data.labels).map(({ id, name, color }) => ({ id, name, color }));
        const event = await appendArchiveActivity(tx, archive, userId, `committee-labels:${labelsVersion}`, {
          kind: "PROPOSAL_LABELS_SET", authority: "COMMITTEE_ACCOUNT", labelsVersion, catalogHash: COMMITTEE_LABEL_CATALOG.sha256,
          previousLabels: archive.labels, labels
        }, now);
        await tx.proposalArchive.update({ where: { id: archive.id }, data: { labels: data.labels, labelsVersion } });
        await appendCommitteeEvent(tx, scope.id, userId, "PROPOSAL_LABELS_SET", { recordId: archive.recordId, labelsVersion,
          previousLabels: archive.labels, labels: data.labels, eventId: event.id,
          summary: `Updated labels on ${archive.title}: ${labels.length ? labels.map(label => label.name).join(", ") : "none"}.` });
        return { labels: data.labels, labelsVersion };
      }
      if (data.action === "invite") {
        const existingMember = await tx.communityMembership.findFirst({ where: { communityId: scope.id, status: "ACTIVE", user: { email: { equals: data.email, mode: "insensitive" } } } });
        if (existingMember) return fail("COMMITTEE_ALREADY_MEMBER");
        const previous = await tx.committeeInvitation.findFirst({ where: { communityId: scope.id, email: data.email, acceptedAt: null, revokedAt: null } });
        if (previous && previous.expiresAt > now) {
          if (previous.role !== data.role) return fail("COMMITTEE_INVITATION_EXISTS");
          return { invitationId: previous.id };
        }
        if (previous) await tx.committeeInvitation.update({ where: { id: previous.id }, data: { revokedAt: now } });
        if (await tx.committeeInvitation.count({ where: { communityId: scope.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } }) >= 50) return fail("COMMITTEE_INVITATION_LIMIT");
        const invite = await tx.committeeInvitation.create({ data: { id: randomUUID(), communityId: scope.id, email: data.email, role: data.role, invitedById: userId, expiresAt: new Date(+now + 7 * 86400000) } });
        await appendCommitteeEvent(tx, scope.id, userId, "INVITATION_CREATED", { invitationId: invite.id, role: invite.role, summary: `Invited a ${data.role.toLowerCase()}.` });
        return { invitationId: invite.id };
      }
      if (data.action === "revoke-invite") {
        const invite = await tx.committeeInvitation.findFirst({ where: { id: data.invitationId, communityId: scope.id } });
        if (!invite) return fail("COMMITTEE_INVITATION_UNAVAILABLE", 404);
        if (invite.acceptedAt) return fail("COMMITTEE_INVITATION_USED");
        if (!invite.revokedAt) {
          await tx.committeeInvitation.update({ where: { id: invite.id }, data: { revokedAt: now } });
          await appendCommitteeEvent(tx, scope.id, userId, "INVITATION_REVOKED", { invitationId: invite.id, summary: "Revoked an invitation." });
        }
      }
      if (data.action === "accept") {
        const invite = await tx.committeeInvitation.findFirst({ where: { id: data.invitationId, communityId: scope.id, email: actor.user!.email!.toLowerCase() } });
        if (!invite || invite.revokedAt || invite.expiresAt <= now) return fail("COMMITTEE_INVITATION_UNAVAILABLE", 404);
        if (invite.acceptedAt) return fail("COMMITTEE_INVITATION_USED");
        if (invite.role === "OWNER") return fail("COMMITTEE_FORBIDDEN", 403);
        // Revocation of the inviting owner also invalidates outstanding invitations.
        const inviter = await committeeActor(tx, scope.id, invite.invitedById);
        if (!inviter.permissions.canManageTeam || !inviter.canMutate) return fail("COMMITTEE_INVITATION_UNAVAILABLE", 404);
        if (actor.role) return fail("COMMITTEE_ALREADY_MEMBER");
        if (await tx.communityMembership.count({ where: { communityId: scope.id, status: "ACTIVE" } }) >= 200) return fail("COMMITTEE_MEMBER_LIMIT");
        const membership = await tx.communityMembership.upsert({ where: { communityId_userId: { communityId: scope.id, userId } },
          create: { communityId: scope.id, userId, role: invite.role, publicName: data.publicName },
          update: { role: invite.role, status: "ACTIVE", publicName: data.publicName, version: { increment: 1 } } });
        await tx.committeeInvitation.update({ where: { id: invite.id }, data: { acceptedAt: now, acceptedById: userId } });
        await appendCommitteeEvent(tx, scope.id, userId, "MEMBER_JOINED", { memberId: membership.id, role: invite.role, publicName: data.publicName, summary: `${data.publicName} joined as ${invite.role.toLowerCase()}.` });
      }
      if (data.action === "member") {
        const target = await tx.communityMembership.findFirst({ where: { id: data.memberId, communityId: scope.id }, include: { user: true } });
        if (!target) return fail("COMMITTEE_MEMBER_UNAVAILABLE", 404);
        if (target.role === "OWNER" || target.userId === userId) return fail("COMMITTEE_OWNER_PROTECTED", 403);
        if (target.version !== data.version) return fail("COMMITTEE_REFRESH_REQUIRED");
        if (target.status === "DISABLED" && data.status === "ACTIVE" && await tx.communityMembership.count({ where: { communityId: scope.id, status: "ACTIVE" } }) >= 200) return fail("COMMITTEE_MEMBER_LIMIT");
        await tx.communityMembership.update({ where: { id: target.id }, data: { role: data.role, status: data.status, version: { increment: 1 } } });
        if (data.status === "DISABLED" && target.user.email) await tx.committeeInvitation.updateMany({ where: { communityId: scope.id, email: target.user.email.toLowerCase(), acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
        await appendCommitteeEvent(tx, scope.id, userId, "MEMBER_CHANGED", { memberId: target.id, fromRole: target.role, toRole: data.role, fromStatus: target.status, toStatus: data.status, reason: data.reason,
          summary: `${memberLabel(target)}: ${data.status === "DISABLED" ? "access removed" : data.role.toLowerCase()}. ${data.reason}` });
      }
      if (data.action === "policy") {
        // Reject stale clients trying to reinstate the former timed defaults.
        // Historical policy rows and audit records remain intact.
        return fail("COMMITTEE_FIXED_RULES");
      }
      return { ok: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }); }
    catch (error) { if (!(isLifecycleConflict(error) && attempt < 2)) throw error; }
  }
  return fail("COMMITTEE_REFRESH_REQUIRED");
}
