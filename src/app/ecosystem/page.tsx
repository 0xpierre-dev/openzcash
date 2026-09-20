import { Suspense } from "react";
import { EcosystemExplorer } from "@/components/ecosystem/explorer";
import { loadEcosystemCatalog } from "@/lib/ecosystem/data";

export const metadata = {
  title: "Ecosystem · OpenZcash",
  description: "Explore Zcash projects, maintainers, public code and source-linked funding history.",
};

export default function EcosystemPage() {
  return (
    // useSearchParams inside the explorer needs a boundary for the static shell.
    <Suspense fallback={null}>
      <EcosystemExplorer catalog={loadEcosystemCatalog()} mode="ecosystem" />
    </Suspense>
  );
}
