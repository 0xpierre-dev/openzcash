import { MonthlyBundle } from "@/components/monthly/monthly-bundle";
import { monthlyEditions, monthlyReadingSets } from "@/lib/monthly/catalog";
import { publicationView } from "@/lib/monthly/reading-set";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const metadata = pageMetadata({
  title: "Monthly · OpenZcash",
  description: "Read OpenZcash Monthly and Operations: teams, wallets, funding, communities and decisions, with original sources.",
  path: "/monthly",
});

export default async function MonthlyPage({ searchParams }: { searchParams: Promise<{ publication?: string }> }) {
  const { publication } = await searchParams;
  const current = monthlyEditions.find((edition) => edition.kind === "monthly") ?? monthlyEditions[0];
  const set = monthlyReadingSets.find((item) => item.id === current.id)!;
  return <MonthlyBundle key={set.id} data={set} editions={monthlyEditions} initialView={publicationView(publication)} />;
}
