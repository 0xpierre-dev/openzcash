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

/**
 * The registry's line about an organisation, as its page shows it under the
 * name, kept to the whole sentences that fit in `max` characters (link
 * previews cut longer descriptions).
 */
export function organizationDescription(
  id: string,
  max = 200,
): string | undefined {
  const line = catalog.registry.organizations.find((o) => o.id === id)?.description;
  if (!line || line.length <= max) return line;
  const sentences = line.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [line];
  let fitted = "";
  for (const sentence of sentences) {
    if ((fitted + sentence).trim().length > max) break;
    fitted += sentence;
  }
  return fitted.trim() || `${line.slice(0, line.lastIndexOf(" ", max - 1))}…`;
}
