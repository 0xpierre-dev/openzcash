import { describe, expect, it } from "vitest";
import {
  COHORTS,
  MEMBERS,
  membersByCohort,
  officeMembers,
} from "./current-committee-data";

describe("current committee public record", () => {
  it("seats the 3D office from the same source-linked facts", () => {
    const office = officeMembers();
    expect(office.map((m) => m.name)).toEqual(MEMBERS.map((m) => m.name));
    for (const seat of office) {
      const member = MEMBERS.find((m) => m.name === seat.name)!;
      expect(seat.img).toBe(member.img);
      for (const tag of seat.tags) {
        expect(member.facts.map((f) => f.label)).toContain(tag);
      }
    }
    // A current role leads the caption when the member has one.
    expect(office.find((m) => m.name === "hanh")?.tags[0]).toBe(
      "Zkool · creator (current)",
    );
  });

  it("groups every seat into one of the two cohorts", () => {
    const groups = membersByCohort();
    expect(groups.flatMap((g) => g.members)).toHaveLength(MEMBERS.length);
    for (const g of groups) {
      expect(COHORTS[g.cohort].termEnds).toBeTruthy();
      for (const m of g.members)
        expect(m.term).toContain(COHORTS[g.cohort].termEnds.slice(0, 3));
    }
  });

  it("keeps all five forum profiles and facts source-linked", () => {
    expect(MEMBERS).toHaveLength(5);

    for (const member of MEMBERS) {
      expect(member.url).toMatch(/^https:\/\/forum\.zcashcommunity\.com\/u\//);
      expect(member.facts.length).toBeGreaterThan(0);
      for (const fact of member.facts) {
        expect(fact.source).toMatch(/^https:\/\//);
        expect(fact.sourceLabel.length).toBeGreaterThan(0);
      }
    }
  });

  it("gives every seated member the same public-ledger access", () => {
    expect(
      MEMBERS.map((member) => [member.name, member.ledger?.recipient]),
    ).toEqual([
      ["GGuy", "GGuy"],
      ["Paul Brigner", "PGP for Crypto, LLC"],
      ["hanh", "Hanh"],
      ["Zerodartz", "Zerodartz"],
      ["Artkor", "Artkor"],
    ]);
  });

  it("separates Hanh's project history from current work and grant status", () => {
    const hanh = MEMBERS.find((member) => member.name === "hanh");

    expect(hanh?.facts.map((fact) => fact.label)).toEqual([
      "YWallet · creator (legacy)",
      "Zkool · creator (current)",
      "Coin Voting · builder",
    ]);
    expect(hanh?.ledgerFacts?.map((fact) => fact.label)).toEqual([
      "zaino · completed Aug 2026",
      "Coin Voting · open grant",
    ]);
    expect(
      hanh?.ledgerFacts?.map((fact) =>
        "href" in fact ? fact.href : undefined,
      ),
    ).toEqual([
      "/zcg/grant?g=zaino%20-%20Stability%2C%20Performance%20%26%20Testing",
      "/zcg/grant?g=Maintenance%20and%20Improvements%20to%20Coin%20Voting",
    ]);
    expect(
      hanh?.ledgerFacts?.every((fact) =>
        fact.source.includes("docs.google.com"),
      ),
    ).toBe(true);
  });

  it("keeps Paul's current role separate from the grant-linked organization", () => {
    const paul = MEMBERS.find((member) => member.name === "Paul Brigner");

    expect(paul?.facts.map((fact) => fact.label)).toContain(
      "ZODL · policy officer",
    );
    expect(paul?.ledger).toMatchObject({
      relation: "organization",
      relationLabel: "PGP for Crypto",
    });
  });

  it("links Zerodartz's ZecHub DAO membership to the public member registry", () => {
    const zerodartz = MEMBERS.find((member) => member.name === "Zerodartz");

    expect(zerodartz?.facts).toContainEqual({
      label: "ZecHub DAO · member",
      source: "https://zechub.wiki/dao",
      sourceLabel: "ZecHub DAO member registry",
      tone: "current",
    });
  });
});
