import { MonthlyReader } from "@/components/monthly/monthly-reader";
import { MonthlyBundle } from "@/components/monthly/monthly-bundle";
import { monthlyEditions, monthlyReadingSets } from "@/lib/monthly/catalog";
import { publicationView } from "@/lib/monthly/reading-set";

export const metadata = {
  title: "Monthly · OpenZcash",
  description: "Read OpenZcash Monthly and Operations: teams, wallets, funding, communities and decisions, with original sources.",
};

export default async function MonthlyPage({ searchParams }: { searchParams: Promise<{ publication?: string }> }) {
  const { publication } = await searchParams;
  const set = monthlyReadingSets.find((item) => item.id === monthlyEditions[0].id);
  if (set) return <MonthlyBundle key={set.id} data={set} editions={monthlyEditions} initialView={publicationView(publication)} />;
  return <MonthlyReader editions={monthlyEditions} edition={monthlyEditions[0]} />;
}
