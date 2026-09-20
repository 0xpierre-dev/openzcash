import {
  SectionHeading,
  RecordLayout,
  RelatedLinks,
  Facts,
} from "@/components/workspace";
import { PageHeader } from "@/components/ui";
import { BudgetCards } from "../budget-cards";
import { Synced } from "@/components/synced";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discretionary budget · OpenZcash" };

export default function ZcgBudgetPage() {
  return (
    <>
      <PageHeader
        title="Discretionary budget"
        subtitle="ZCG's annual discretionary budget: fixed in ZEC and drawn down over the year. Shown in USD and ZEC, which is why the two figures diverge as the price moves."
      />

      <RecordLayout
        aside={
          <>
            <Facts
              title="Reading the budget"
              rows={[
                ["Budget basis", "Annual ZEC allocation"],
                ["USD display", "Depends on the ZEC exchange rate"],
                ["Scope", "Discretionary operating budget"],
              ]}
            />
            <RelatedLinks
              links={[
                {
                  href: "/zcg/disbursements?sheet=discretionary",
                  label: "Discretionary payments",
                },
                { href: "/zcg/totals", label: "All-time funding totals" },
                { href: "/zcg/methodology", label: "Sources & calculation" },
              ]}
            />
          </>
        }
      >
        <SectionHeading
          title="Annual allocation & drawdown"
          description="Compare the ZEC budget, spending and remaining balance in their original units."
        />
        <BudgetCards />
      </RecordLayout>

      <Synced className="mt-6" />
    </>
  );
}
