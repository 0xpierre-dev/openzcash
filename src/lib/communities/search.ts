/**
 * The /communities search box: a community matches when every word of the
 * query appears in its name, local name, country or region, in any order,
 * with case and accents folded on both sides ("queretaro" finds
 * "Querétaro", and the club's former card name "Zcash Club Querétaro"
 * still finds it after the rename).
 */

import type { Community } from "./data";

const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function matchesQuery(c: Community, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(`${c.name} ${c.localName ?? ""} ${c.country} ${c.region}`);
  return words.every((w) => hay.includes(w));
}
