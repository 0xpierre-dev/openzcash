import { describe, expect, it } from "vitest";
import { COMMUNITIES } from "./data";
import { matchesQuery } from "./search";

const found = (query: string) =>
  COMMUNITIES.filter((c) => matchesQuery(c, query)).map((c) => c.name);

describe("matchesQuery", () => {
  it("matches everything on an empty or blank query", () => {
    expect(found("")).toHaveLength(COMMUNITIES.length);
    expect(found("   ")).toHaveLength(COMMUNITIES.length);
  });

  it("ignores accents and case on both sides", () => {
    expect(found("queretaro")).toEqual(["Zcash México"]);
    expect(found("QUERÉTARO")).toEqual(["Zcash México"]);
    expect(found("mexico")).toEqual(
      expect.arrayContaining(["Zcash México", "CodeRaiz México"]),
    );
    expect(found("turkiye")).toEqual(["Zcash Türkiye"]);
    expect(found("espanol")).toEqual(["Zcash en Español"]);
  });

  it("matches every word in any order, so the club's former card name still finds it", () => {
    expect(found("Zcash Club Querétaro")).toEqual(["Zcash México"]);
    expect(found("Zcash Club")).toEqual(
      expect.arrayContaining([
        "Zcash México",
        "Club Zcash Caracas",
        "Club Zcash Barcelona",
      ]),
    );
  });

  it("searches country and region too, and finds nothing for an unknown place", () => {
    expect(found("Uganda")).toEqual([]);
    expect(found("East Africa")).toEqual(["Zcash East Africa"]);
    expect(found("Middle East")).toEqual(["Zcash Arabia"]);
    expect(found("Atlantis")).toEqual([]);
  });
});
