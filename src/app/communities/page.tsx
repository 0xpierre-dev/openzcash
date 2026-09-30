import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { COMMUNITIES, LEDGER_FALLBACK_AS_OF } from "@/lib/communities/data";
import { getCommunityActivity } from "@/lib/communities/forum-activity";
import { getCommunitiesFunding } from "@/lib/communities/funding";
import { CommunitiesView } from "./communities-view";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Global Communities · OpenZcash",
  description:
    "The global Zcash community groups: who they are, where to find them, which ones ZCG funds (with audited numbers), and what each one has been up to on the forum.",
};

async function LiveDirectory() {
  const [activity, funding] = await Promise.all([
    getCommunityActivity(COMMUNITIES),
    getCommunitiesFunding(),
  ]);
  return (
    <CommunitiesView
      communities={funding.communities}
      activity={activity}
      fundingSource={funding.source}
      fallbackAsOf={LEDGER_FALLBACK_AS_OF}
    />
  );
}

export default function CommunitiesPage() {
  return (
    <>
      <PageHeader
        title="Global Communities"
        subtitle="The regional groups building Zcash adoption worldwide: who is active now, who ZCG and the ZecHub DAO fund, and where to find them. Activity is live from the community forum and YouTube; X and Instagram profiles are linked."
      />

      <Suspense
        fallback={
          <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-600 shadow-sm">
            Loading live forum activity…
          </div>
        }
      >
        <LiveDirectory />
      </Suspense>

      <p className="mt-8 text-xs leading-relaxed text-stone-600">
        ZCG figures are read from the ZCG ledger mirror of the official
        spreadsheet, collected every 6 hours (budgeted USD, not paid; see the
        methodology), and match the recipients page. ZecHub DAO grants are
        mapped by approved DAO DAO proposal; their paid and outstanding amounts
        come from the ZecHub treasury sheet mirror, also collected every 6
        hours, and grants older than the sheet show their period only. Umbrella
        grants and other channels are noted in each badge&apos;s tooltip. Links
        seeded from ZecHub&apos;s community directory and verified individually.
      </p>
    </>
  );
}
