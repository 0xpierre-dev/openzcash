import { db } from "@/lib/db";
import { isDemoAccount } from "@/lib/auth/email-policy";
import { emailInput } from "@/lib/services/email-auth";
import { publicReviewerName } from "@/lib/domain/committee";
import { appendCommitteeEvent, CommitteeError, lockCommittee, resolveCommittee } from "./committee-access";

/** Operator-only setup. Never exposed as an HTTP endpoint or used by demo login. */
export async function bootstrapCommitteeOwner(hostId: string, email: string, publicName: string, apply = false) {
  const targetEmail = emailInput.parse(email), name = publicReviewerName.parse(publicName);
  return db.$transaction(async tx => {
    const scope = await resolveCommittee(tx, hostId); await lockCommittee(tx, scope.id);
    const matches = await tx.user.findMany({ where: { email: { equals: targetEmail, mode: "insensitive" } }, take: 2 });
    const user = matches.length === 1 ? matches[0] : null;
    if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt || isDemoAccount(user.id)) throw new CommitteeError("A unique, active, verified personal account is required.");
    const owners = await tx.communityMembership.findMany({ where: { communityId: scope.id, role: "OWNER", status: "ACTIVE" } });
    if (owners.some(owner => owner.userId !== user.id && !isDemoAccount(owner.userId))) throw new CommitteeError("A real owner already exists. Bootstrap cannot replace committee authority.", 409);
    const demos = await tx.communityMembership.findMany({ where: { communityId: scope.id, status: "ACTIVE", userId: { startsWith: "preview_" } } });
    if (apply && !owners.some(owner => owner.userId === user.id)) {
      await tx.communityMembership.upsert({ where: { communityId_userId: { communityId: scope.id, userId: user.id } },
        create: { communityId: scope.id, userId: user.id, role: "OWNER", publicName: name }, update: { role: "OWNER", status: "ACTIVE", publicName: name, version: { increment: 1 } } });
      await tx.communityMembership.updateMany({ where: { id: { in: demos.map(m => m.id) } }, data: { status: "DISABLED", version: { increment: 1 } } });
      await appendCommitteeEvent(tx, scope.id, user.id, "OWNER_BOOTSTRAPPED", { retiredDemoSeats: demos.length, summary: `Operator initialized ${name} as the first personal owner; ${demos.length} demo seats retired.` });
    }
    return { committee: scope.name, mode: apply ? "APPLIED" : "DRY_RUN", alreadyOwner: owners.some(owner => owner.userId === user.id), demoSeatsToRetire: demos.length };
  }, { isolationLevel: "Serializable" });
}
