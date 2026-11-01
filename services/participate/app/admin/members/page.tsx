import { redirect } from "next/navigation";
import { resolveAdminCommunity } from "@/lib/auth/admin-community";
import { canManagePolls } from "@/lib/auth/guards";
import { readSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage({ searchParams }: { searchParams?: Promise<{ communityId?: string }> }) {
  const session = await readSession();

  if (!session) {
    redirect("/login?next=%2Fadmin%2Fmembers");
  }

  if (!canManagePolls(session.role)) {
    redirect("/polls");
  }

  const { community } = await resolveAdminCommunity(session.userId, (await searchParams)?.communityId);
  redirect(`/communities/${encodeURIComponent(community.id)}/members`);
}
