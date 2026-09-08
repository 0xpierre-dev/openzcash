import { EcosystemExplorer } from "@/components/ecosystem/explorer";
import { loadEcosystemCatalog } from "@/lib/ecosystem/data";

export const metadata = {
  title: "Development · OpenZcash",
  description: "Public Zcash repository inventory with real default-branch activity, releases, purpose tags and historical funding sources.",
};

export default function DevelopmentPage() {
  return <EcosystemExplorer catalog={loadEcosystemCatalog()} mode="development" />;
}
