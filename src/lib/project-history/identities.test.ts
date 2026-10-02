import { describe, expect, it } from "vitest";
import registry from "@/data/ecosystem/registry.json";
import snapshot from "@/data/ecosystem/snapshot.json";
import { COMMUNITIES } from "@/lib/communities/data";
import type { Catalog } from "@/lib/ecosystem/types";
import { historyIdentities, searchHistoryIdentities } from "./identities";

const identities = historyIdentities({ registry, snapshot } as unknown as Catalog);
describe("history identity coverage", () => {
  it("includes every curated project and community with unique IDs", () => {
    expect(new Set(identities.map(item => item.id)).size).toBe(identities.length);
    for (const project of registry.projects) expect(identities.some(item => item.id === project.id)).toBe(true);
    for (const community of COMMUNITIES) expect(identities.some(item => item.communityId === community.id)).toBe(true);
  });
  it("selects an exact ID while leaving broad names ambiguous", () => {
    expect(searchHistoryIdentities(identities, "zaino").map(item => item.id)).toEqual(["zaino"]);
    expect(searchHistoryIdentities(identities, "zingo").length).toBeGreaterThan(1);
    expect(searchHistoryIdentities(identities, "does-not-exist")).toEqual([]);
  });
  it("does not inherit every organization repository or recipient into a project", () => {
    const zaino = identities.find(item => item.id === "zaino")!;
    expect(zaino.repositories.map(repo => repo.fullName.toLowerCase())).toEqual(["zingolabs/zaino"]);
    expect(zaino.recipientKeys).toEqual([]);
  });
});
