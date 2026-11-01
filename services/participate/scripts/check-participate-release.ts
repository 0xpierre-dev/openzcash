import { db } from "../lib/db";
import { publicPilotScope } from "../lib/auth/public-pilot-policy";
import { verifyArchivePackage } from "../lib/archive/format";

/** Read-only preflight. No email, migration, credit grant or wallet request. Never logs secret values. */
async function main() {
  const checks: { check: string; passed: boolean }[] = [];
  const add = (check: string, passed: boolean) => checks.push({ check, passed });
  const scope = publicPilotScope();
  add("Explicit public free pilot scope", Boolean(scope));
  add("Shared preview disabled", process.env.WORKSPACE_PREVIEW !== "true");
  add("Committee operations disabled", process.env.PARTICIPATE_COMMITTEE_ENABLED !== "true");
  add("Real credit purchases disabled", process.env.CREDIT_PAYMENTS_ENABLED !== "true");
  let canonical = false;
  try {
    const service = new URL(process.env.APP_BASE_URL ?? ""), parent = new URL(process.env.PARTICIPATE_PARENT_ORIGIN ?? "");
    canonical = service.protocol === "https:" && !service.username && !service.password && service.pathname === "/" && !service.search && !service.hash && parent.href === service.href;
  } catch { /* Missing/malformed configuration is reported without its contents. */ }
  add("Participate and portal share one canonical HTTPS origin", canonical);
  add("Strong separate authentication secrets", Buffer.byteLength(process.env.EMAIL_AUTH_SECRET ?? "") >= 32 && Buffer.byteLength(process.env.ZCAP_SESSION_SECRET ?? "") >= 32 && process.env.EMAIL_AUTH_SECRET !== process.env.ZCAP_SESSION_SECRET);
  add("Support sender configuration present (delivery requires a separate test)", Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim()));
  try {
    const [host, committee, admin, triggers, tables, archiveCount, anchorCount, revisions] = await Promise.all([
      db.community.findFirst({ where: { id: scope?.hostId ?? "", kind: "DAO" }, select: { id: true } }),
      db.community.findFirst({ where: { id: scope?.committeeId ?? "", kind: "COMMITTEE" }, select: { id: true, participationMode: true } }),
      db.user.findMany({ where: { email: { equals: process.env.PARTICIPATE_RELEASE_ADMIN_EMAIL?.trim() || "not-configured@example.invalid", mode: "insensitive" }, status: "ACTIVE", role: "ADMIN", emailVerifiedAt: { not: null } }, select: { passwordHash: true } }),
      db.$queryRaw<{ name: string }[]>`SELECT t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled IN ('O', 'A') AND n.nspname = current_schema()`,
      db.$queryRaw<{ name: string }[]>`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema()`,
      db.proposalArchive.count({ where: { communityId: scope?.hostId ?? "" } }),
      db.archiveAnchor.count({ where: { network: "mainnet", revision: { archive: { communityId: scope?.hostId ?? "" } } } }),
      db.archiveRevision.findMany({ where: { archive: { communityId: scope?.hostId ?? "" } }, select: { manifestHash: true, packageJson: true } })
    ]);
    add("Host and credit committee exist", Boolean(host && committee?.participationMode === "CREDITS"));
    const mismatched = scope ? await db.proposalArchive.count({ where: { communityId: scope.hostId, OR: [{ committeeId: null }, { committeeId: { not: scope.committeeId } }] } }) : 1;
    add("All public records use the intended committee", mismatched === 0);
    add("Verified admin has a separate password for moderation", admin.length === 1 && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(admin[0].passwordHash));
    const required = ["ArchiveRevision_immutable", "ArchiveAnchor_guard", "ArchiveAnchorCheck_immutable", "ArchiveComment_guard", "ArchiveActivityActor_immutable", "ArchiveActivityEvent_immutable", "ArchiveActivityEvent_guard", "ArchiveActivityInclusion_immutable", "ArchiveActivityInclusion_guard", "ArchiveActivityCheck_immutable", "ArchiveActivityBatch_guard", "CreditOperation_immutable", "ProposalSubmission_guard", "ProposalDraftDeletion_immutable", "ProposalAbandonment_immutable", "ProposalAbandonment_guard", "participate_automation_job_immutable", "participate_automation_log_immutable"];
    add("Required SQL integrity triggers installed", required.every(name => triggers.some(trigger => trigger.name === name)));
    const requiredTables = ["ProposalArchive", "ArchiveRevision", "ArchiveAnchor", "ArchiveAnchorCheck", "ArchiveActivityEvent", "ArchiveActivityBatch", "ArchiveComment", "ArchiveProposalLike", "ProposalSubmission", "CreditOperation", "EmailAuthChallenge", "EmailAuthThrottle", "PasskeyThrottle", "ParticipateAutomationState", "ParticipateAutomationJob", "ParticipateAutomationLog"];
    add("Required archive, authentication and automation tables exist", requiredTables.every(name => tables.some(table => table.name === name)));
    add("Imported catalog has revisions", archiveCount > 0 && revisions.length >= archiveCount);
    add("Anchors refer to available revisions", anchorCount <= revisions.length);
    add("Stored archive files match their published fingerprints", (await Promise.all(revisions.map(async revision => {
      try { await verifyArchivePackage(JSON.parse(revision.packageJson), revision.manifestHash); return true; }
      catch { return false; }
    }))).every(Boolean));
    // These queries also fail if the email and admin throttle schema upgrades are missing.
    await db.emailAuthChallenge.count(); await db.passkeyThrottle.count();
    add("Database and authentication schema reachable", true);
  } catch { add("Database and authentication schema reachable", false); }
  console.log(JSON.stringify({ checks, remainingAcceptance: ["Backup restored and archive hashes compared", "Final-origin login and session with two independent accounts", "Desktop and mobile public journey", "Next real proposal anchor checked independently", "Recovery files replicated and failure monitoring enabled"] }, null, 2));
  if (checks.some(check => !check.passed)) process.exitCode = 1;
}
main().catch(() => { console.error("Release check failed without changing state."); process.exitCode = 1; }).finally(() => db.$disconnect());
