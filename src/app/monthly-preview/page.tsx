import { MonthlyBundlePreview } from "@/components/monthly/monthly-bundle-preview";

export const metadata = { title: "Reading set preview · OpenZcash", robots: { index: false, follow: false } };

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ publication?: string }> }) {
  const { publication } = await searchParams;
  const initialView = publication === "voter" ? "operations" : publication === "operations" || publication === "sources" ? publication : "monthly";
  return <MonthlyBundlePreview initialView={initialView} />;
}
