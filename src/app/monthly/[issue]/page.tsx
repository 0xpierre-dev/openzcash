import { notFound } from "next/navigation";
import { MonthlyReader } from "@/components/monthly/monthly-reader";
import { MonthlyBundle } from "@/components/monthly/monthly-bundle";
import { monthlyEditions, monthlyReadingSets, monthLabel } from "@/lib/monthly/catalog";
import { publicationView } from "@/lib/monthly/reading-set";

type Props = { params: Promise<{ issue: string }>; searchParams: Promise<{ publication?: string }> };

export async function generateMetadata({ params }: Props) {
  const { issue } = await params;
  const edition = monthlyEditions.find((e) => e.id === issue);
  return { title: edition ? `${monthLabel(edition.month)} · ${edition.label} · OpenZcash Monthly` : "Edition not found · OpenZcash" };
}

export default async function IssuePage({ params, searchParams }: Props) {
  const { issue } = await params;
  const edition = monthlyEditions.find((e) => e.id === issue);
  if (!edition) notFound();
  const set = monthlyReadingSets.find((item) => item.id === issue);
  if (set) {
    const { publication } = await searchParams;
    return <MonthlyBundle key={set.id} data={set} editions={monthlyEditions} initialView={publicationView(publication)} />;
  }
  return <MonthlyReader key={edition.id} editions={monthlyEditions} edition={edition} />;
}
