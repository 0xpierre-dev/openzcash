import {
  SectionHeading,
  SourceNote,
} from "@/components/workspace";
import { PageHeader } from "@/components/ui";
import { BudgetCards } from "../budget-cards";
import { Synced } from "@/components/synced";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({
  title: "Discretionary budget · OpenZcash",
  description:
    "ZCG's annual discretionary budget: fixed in ZEC and drawn down over the year. Shown in USD and ZEC, which is why the two figures diverge as the price moves.",
  path: "/zcg/budget",
});

export default function ZcgBudgetPage() {
  return (
    <>
      <PageHeader
        title="Discretionary budget"
        subtitle="ZCG's annual discretionary budget: fixed in ZEC and drawn down over the year. Shown in USD and ZEC, which is why the two figures diverge as the price moves."
      />

      <>
        <SectionHeading
          title="Annual allocation & drawdown"
          description="Compare the ZEC budget, spending and remaining balance in their original units."
        />
        <BudgetCards />
        <SourceNote>
          This annual worksheet and the cumulative operations split on the
          totals page are two readings of the same programme on purpose. The
          methodology page explains why they are not one number, and why its
          USD and ZEC columns must not be merged.
        </SourceNote>
      </>

      <Synced className="mt-6" />
    </>
  );
}
