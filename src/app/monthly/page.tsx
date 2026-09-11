import { MonthlyReader } from "@/components/monthly/monthly-reader";
import { monthlyEditions } from "@/lib/monthly/catalog";

export const metadata = {
  title: "Monthly · OpenZcash",
  description: "Read OpenZcash Monthly: grants, builders, wallets, communities and governance in one illustrated report.",
};

export default function MonthlyPage() {
  return <MonthlyReader editions={monthlyEditions} edition={monthlyEditions[0]} />;
}
