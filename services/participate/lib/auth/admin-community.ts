import { notFound, redirect } from "next/navigation";
import { readManagedCommunities } from "@/lib/services/communities";

export async function resolveAdminCommunity(userId: string, requestedId?: string) {
  const communities = await readManagedCommunities(userId);
  const community = requestedId
    ? communities.find((entry) => entry.id === requestedId)
    : communities[0];

  if (!community) {
    if (requestedId) notFound();
    redirect("/admin/communities");
  }

  return { community, communities };
}
