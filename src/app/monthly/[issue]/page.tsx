import { notFound, redirect } from "next/navigation";
import { MonthlyBundle } from "@/components/monthly/monthly-bundle";
import { editionLabel, monthlyEditions, monthlyReadingSets, monthLabel, statusLabel } from "@/lib/monthly/catalog";
import { publicationView } from "@/lib/monthly/reading-set";
import { pageMetadata } from "@/lib/seo/page-metadata";

type Props = { params: Promise<{ issue: string }>; searchParams: Promise<{ publication?: string }> };

export async function generateMetadata({ params }: Props) {
  const { issue } = await params;
  const edition = monthlyEditions.find((e) => e.id === issue);
  if (!edition) return { title: "Edition not found · OpenZcash" };
  return pageMetadata({
    title: `${monthLabel(edition.month)} · ${edition.label} · OpenZcash Monthly`,
    description: `Read the ${editionLabel(edition)} OpenZcash Monthly and Operations: teams, wallets, funding, communities and decisions, with original sources.`,
    path: `/monthly/${edition.id}`,
    card: { title: monthLabel(edition.month), kicker: `${statusLabel(edition)} · ${edition.label}` },
  });
}

export default async function IssuePage({ params, searchParams }: Props) {
  const { issue } = await params;
  const { publication } = await searchParams;
  // Retired September sample links open the full close in the selected publication.
  if (issue === "2026-09-01-to-10") {
    redirect(`/monthly/2026-09?publication=${publicationView(publication)}#1`);
  }
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
