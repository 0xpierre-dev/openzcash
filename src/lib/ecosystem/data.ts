import "server-only";
import { createHash } from "node:crypto";
import registryData from "@/data/ecosystem/registry.json";
import snapshotData from "@/data/ecosystem/snapshot.json";
import type { Catalog } from "./types";
import { validateCatalog } from "./catalog";

// A checked, reproducible public snapshot. Page requests cannot execute a
// collector, read credentials, or write to the existing grant database.
const catalog = {
  registry: registryData,
  snapshot: snapshotData,
} as unknown as Catalog;
validateCatalog(catalog);
if (createHash("sha256").update(JSON.stringify(catalog.registry)).digest("hex") !== catalog.snapshot.registryHash)
  throw new Error("Ecosystem registry changed. Run npm run sync-ecosystem before publishing.");

export function loadEcosystemCatalog(): Catalog {
  return catalog;
}
