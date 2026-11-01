import { readCommitteePreviewToken } from "@/lib/auth/committee-admin-cookie";
import { headers } from "next/headers";
import { ParticipateBridge } from "@/components/participate-bridge";
import { WorkspaceFrame } from "@/components/community-workspace";
import { CommitteeWorkspacePanel } from "@/components/committee-workspace";
import { readBrowsingWorkspaceContext } from "@/lib/services/workspace";
import { readCommitteeWorkspace } from "@/lib/services/committee";
import { readCommitteeEntry } from "@/lib/services/committee-access";
import { participateParentOrigin } from "@/lib/domain/participate-embed";
import { passkeyContext } from "@/lib/auth/passkey-policy";
import { readProposalParticipationBoard } from "@/lib/services/archive-discussion";
import "@/app/committee.css";

export const dynamic = "force-dynamic";
export default async function CommitteePage({ searchParams }: { searchParams: Promise<{ record?: string }> }) {
  const search = await searchParams;
  const hostId = process.env.PARTICIPATE_COMMUNITY_ID;
  if (!hostId) return <main className="dao-main"><h1>Committee workspace</h1><p>The workspace is unavailable.</p></main>;
  const context = await readBrowsingWorkspaceContext(hostId);
  const userId = context.session?.subjectType === "user" ? context.session.userId : undefined;
  let signing = null;
  // The request host is only used in development; production must pin the origin.
  try { signing = passkeyContext({ url: process.env.APP_BASE_URL || `http://${(await headers()).get("host")}` }); } catch { /* Display not ready. */ }
  const previewToken = await readCommitteePreviewToken();
  const [initial, entry, board] = await Promise.all([readCommitteeWorkspace(hostId, userId, signing, undefined, previewToken), readCommitteeEntry(hostId, userId, previewToken), readProposalParticipationBoard(hostId, context.session)]);
  return <ParticipateBridge parentOrigin={participateParentOrigin(process.env.PARTICIPATE_PARENT_ORIGIN)}><WorkspaceFrame {...context}
    viewer={context.viewer ? { ...context.viewer, committeeEntry: entry ?? undefined } : null} workspaceModule="proposals" embedded embeddedSection="committee" creditScope={board.participation?.creditScope}>
    <CommitteeWorkspacePanel key={`${userId ?? "guest"}:${search.record ?? "queue"}`} initial={initial} initialRecordId={search.record} />
  </WorkspaceFrame></ParticipateBridge>;
}
