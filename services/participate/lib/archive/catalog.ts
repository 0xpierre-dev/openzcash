import catalog from "@/data/archive-pilot/catalog.json";
import graphsense from "@/data/archive-pilot/zcg-graphsense-2026-09-28-r1.json";
import ironwood from "@/data/archive-pilot/zcg-ironwood-2026-09-28-r1.json";
import seedsigner from "@/data/archive-pilot/zcg-seedsigner-2026-09-14-r1.json";
import mumbai from "@/data/archive-pilot/zcg-mumbai-2026-09-14-r1.json";
import arabia from "@/data/archive-pilot/zcg-arabia-2026-08-31-r1.json";
import { verifyArchivePackage } from "@/lib/archive/format";

const packages = [graphsense, ironwood, seedsigner, mumbai, arabia];
export async function readPilotPackages() {
  return Promise.all(catalog.map(async (entry, index) => {
    const checked = await verifyArchivePackage(packages[index], entry.manifestHash);
    if (checked.manifest.recordId !== entry.id || checked.manifest.revision !== entry.revision) throw new Error("Archive catalog mismatch");
    return checked;
  }));
}
