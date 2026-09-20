import {
  SectionHeading,
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

      <>
        <SectionHeading
          title="Annual allocation & drawdown"
          description="Compare the ZEC budget, spending and remaining balance in their original units."
        />
        <BudgetCards />
      </>

      <Synced className="mt-6" />
    </>
  );
}
