import { NextResponse } from "next/server";
import { cached } from "@/lib/cache/memo";
import { disbursementsSummary } from "@/lib/zcg/disbursements-repo";
import { listProposals, officeUnderReview } from "@/lib/zcg/proposals-repo";
import { publicationDay } from "@/lib/zcg/publication-policy";
import { getPaymentSchedule } from "@/lib/zcg/schedule-repo";
import { getMeetings } from "@/lib/zcg/governance-repo";
import { loadEcosystemCatalog } from "@/lib/ecosystem/data";
import { COMMUNITIES } from "@/lib/communities/data";
import { getArboristCalls } from "@/lib/arborist/notes";
import { MEMBERS } from "@/app/zcg/current-committee-data";

export const dynamic = "force-dynamic";

const TTL_MS = 5 * 60_000;
const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Record counts for the shell's sidebar, keyed by route. Every source is
 * optional: one that fails simply leaves its item without a count. Cached
 * in-process for five minutes; the sidebar reads it after the page paints.
 */
async function compute(): Promise<Record<string, string>> {
  const [summary, proposals, queue, schedule, meetings, calls] =
    await Promise.all([
      disbursementsSummary().catch(() => null),
      cached(`listProposals:all:${publicationDay()}`, TTL_MS, () =>
        listProposals({}),
      ).catch(() => null),
      officeUnderReview(100).catch(() => null),
      getPaymentSchedule().catch(() => null),
      getMeetings().catch(() => null),
      getArboristCalls().catch(() => null),
    ]);
  let catalog: ReturnType<typeof loadEcosystemCatalog> | null = null;
  try {
    catalog = loadEcosystemCatalog();
  } catch {
    catalog = null;
  }
  const out: Record<string, string> = {};
  if (summary) {
    out["/zcg/grants"] = fmt(summary.grantCount);
    out["/zcg/disbursements"] = fmt(summary.count);
    out["/zcg/recipients"] = fmt(summary.recipientCount);
  }
  if (proposals) out["/zcg/proposals"] = fmt(proposals.length);
  if (queue) out["/zcg/office"] = fmt(queue.length);
  if (schedule) out["/zcg/schedule"] = fmt(schedule.rows.length);
  out["/zcg/committee"] = fmt(MEMBERS.length);
  if (meetings) out["/zcg/meetings"] = fmt(meetings.length);
  if (catalog) {
    out["/ecosystem"] = fmt(catalog.registry.projects.length);
    out["/development"] = fmt(catalog.snapshot.repositories.length);
  }
  out["/communities"] = fmt(COMMUNITIES.length);
  if (calls) out["/arborist"] = fmt(calls.length);
  return out;
}

export async function GET() {
  const counts = await cached("nav:counts", TTL_MS, compute).catch(
    () => ({}) as Record<string, string>,
  );
  return NextResponse.json(counts, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
  });
}
