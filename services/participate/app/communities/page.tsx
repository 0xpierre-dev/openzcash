import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { readManagedCommunities } from "@/lib/services/communities";
import { db } from "@/lib/db";
import { publicWorkspaceCommunityWhere } from "@/lib/services/workspace";

export const dynamic = "force-dynamic";

export default async function CommunityEntryPage() {
  const session = await readSession();
  if (session?.subjectType === "user") {
    const communities = await readManagedCommunities(session.userId);
    if (communities.length) redirect(`/communities/${encodeURIComponent(communities[0].id)}`);
  }
  const community = await db.community.findFirst({
    where: publicWorkspaceCommunityWhere(),
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true }
  });
  if (community) redirect(`/communities/${encodeURIComponent(community.id)}`);
  redirect("/polls");
}
