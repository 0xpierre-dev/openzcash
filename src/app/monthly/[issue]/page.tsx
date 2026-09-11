import { notFound, redirect } from "next/navigation";
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
  const { publication } = await searchParams;
  // The former mixed August-close link now resolves to the corrected August set.
  if (issue === "2026-09" && !monthlyReadingSets.some((set) => set.id === issue)) {
    redirect(`/monthly/2026-08?publication=${publicationView(publication)}#1`);
  }
  const edition = monthlyEditions.find((e) => e.id === issue);
  if (!edition) notFound();
  const set = monthlyReadingSets.find((item) => item.id === issue);
  if (!set) notFound();
  return <MonthlyBundle key={set.id} data={set} editions={monthlyEditions} initialView={publicationView(publication)} />;
}
