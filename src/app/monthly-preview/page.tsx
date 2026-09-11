import { redirect } from "next/navigation";
import { publicationView } from "@/lib/monthly/reading-set";

export const metadata = { title: "Reading set preview · OpenZcash", robots: { index: false, follow: false } };

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ publication?: string }> }) {
  const { publication } = await searchParams;
  redirect(`/monthly?publication=${publicationView(publication)}`);
}
