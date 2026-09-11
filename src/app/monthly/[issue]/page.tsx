import { notFound } from "next/navigation";
import { MonthlyReader } from "@/components/monthly/monthly-reader";
import { monthlyEditions, monthLabel } from "@/lib/monthly/catalog";

type Props = { params: Promise<{ issue: string }> };

export async function generateMetadata({ params }: Props) {
  const { issue } = await params;
  const edition = monthlyEditions.find((e) => e.id === issue);
  return { title: edition ? `${monthLabel(edition.month)} · ${edition.label} · OpenZcash Monthly` : "Edition not found · OpenZcash" };
}

export default async function IssuePage({ params }: Props) {
  const { issue } = await params;
  const edition = monthlyEditions.find((e) => e.id === issue);
  if (!edition) notFound();
  return <MonthlyReader key={edition.id} editions={monthlyEditions} edition={edition} />;
}
