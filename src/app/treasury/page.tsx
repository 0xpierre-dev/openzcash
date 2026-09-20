import { SectionHeading } from "@/components/workspace";
import { PageHeader } from "@/components/ui";
import { AppLauncher } from "@/components/app-launcher";
import { getIsAdmin } from "@/lib/auth/admin";
import { latestImportAt, maybeAutoRefresh } from "@/lib/zcg/freshness";
import { TreasuryOverview } from "./treasury-overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Treasury at a glance · OpenZcash" };

function syncedAgo(at: Date | null): string {
  if (!at) return "not imported yet";
  const mins = Math.floor((Date.now() - at.getTime()) / 60_000);
  if (mins < 1) return "synced just now";
  if (mins < 60) return `synced ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `synced ${hrs}h ago`;
  return `synced ${Math.floor(hrs / 24)}d ago`;
}

/**
 * The two treasuries at a glance, then the app launcher (reorder or hide
 * apps; the choice stays in this browser). The home is the ZCG overview; the
 * shell's bottom bar keeps the treasuries in view everywhere and links here.
 */
export default async function TreasuryPage() {
  const [isAdmin, lastImport] = await Promise.all([
    getIsAdmin(),
    latestImportAt(),
  ]);
  // Self-heal: kick a background re-import if the spreadsheet data is stale.
  void maybeAutoRefresh();

  return (
    <>
      <PageHeader
        title="Treasury at a glance"
        subtitle="The ZCG operating pool and the Lockbox, read-only and mirrored from the official sources, with every app of the Dev Fund back office below."
      />

      <TreasuryOverview />

      <section className="oz-launcher mt-10">
        <SectionHeading
          title="Apps"
          description="Every record set, side by side. Edit to reorder or hide apps; the choice stays in this browser."
        />
        <AppLauncher isAdmin={isAdmin} />
      </section>

      <p className="mt-8 text-xs text-stone-600">
        ZCG and FPF grant accounting for the Zcash Dev Fund · Spreadsheet{" "}
        {syncedAgo(lastImport)}, auto-refreshes daily
      </p>
    </>
  );
}
