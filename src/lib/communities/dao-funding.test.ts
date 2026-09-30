import { describe, expect, it } from "vitest";
import { COMMUNITIES, type Community } from "./data";
import {
  applyDaoFunding,
  daoGrants,
  resolveDaoGrants,
  sheetKey,
  type DaoPayoutRow,
} from "./dao-funding";
import {
  DAO_SHEET_FALLBACK_AS_OF,
  ZECHUB_DAO_PROPOSALS,
  ZECHUB_DAO_URL,
  type ZechubDaoProposal,
} from "./dao-proposals";

const CATALOG: Record<string, ZechubDaoProposal> = {
  A97: {
    ref: "A97",
    title:
      "Proposal: Zcash Ukraine Regional Community Initiative (September–November 2025)",
    created: "2025-07-24",
    period: "Sep–Nov 2025",
    requested: "65 ZEC",
  },
  A172: {
    ref: "A172",
    title:
      "Zcash East Africa Operations: From Awareness to Adoption ( August – October 2026)",
    created: "2026-08-07",
    period: "Aug–Oct 2026",
    requested: "$5,000",
    sheet: {
      title: "Zcash East Africa August – October 2026 - $5000",
      paidUsd: null,
      outstandingUsd: 5000,
    },
  },
  A178: {
    ref: "A178",
    title: "Club Zcash Querétaro - Zcash México (October-November 2026)",
    created: "2026-09-12",
    period: "Oct–Nov 2026",
    requested: "$5,800",
    sheet: {
      title:
        "Club Zcash Querétaro - Zcash México (October-November 2026) - $5800",
      paidUsd: 1500,
      outstandingUsd: 4300,
    },
  },
};

function row(title: string, over: Partial<DaoPayoutRow> = {}): DaoPayoutRow {
  return {
    title,
    paidUsdCents: null,
    pendingUsdCents: null,
    m1: null,
    m2: null,
    m3: null,
    capturedOn: "2026-10-05",
    ...over,
  };
}

function community(id: string, zcg: Community["zcg"]): Community {
  return {
    id,
    name: id,
    country: "Global",
    flag: "🌐",
    region: "Global",
    language: "English",
    links: {},
    zcg,
    forumTopics: [],
    about: "",
  };
}

const sheetOf = (rows: DaoPayoutRow[]) =>
  new Map(rows.map((r) => [sheetKey(r.title), r]));

describe("sheetKey", () => {
  it("folds case, accents, dash variants and spacing, nothing more", () => {
    expect(sheetKey("Club Zcash Querétaro - Zcash México")).toBe(
      sheetKey("club zcash queretaro – zcash  mexico"),
    );
    expect(sheetKey("Zcash India - $3750 (Mar-May)")).not.toBe(
      sheetKey("Zcash India - $4800 (Jun-Aug)"),
    );
  });
});

describe("resolveDaoGrants", () => {
  it("reads paid, outstanding and milestones from the imported treasury sheet", () => {
    const [g] = resolveDaoGrants(
      ["A178"],
      sheetOf([
        row(
          "Club Zcash Querétaro – Zcash México (October-November 2026) - $5800",
          {
            paidUsdCents: 290_000n,
            pendingUsdCents: 290_000n,
            m1: "Complete",
            m2: "Incomplete",
          },
        ),
      ]),
      CATALOG,
    );
    expect(g).toMatchObject({
      ref: "A178",
      url: `${ZECHUB_DAO_URL}/proposals/A178`,
      payout: "sheet",
      paidUsd: 2900,
      outstandingUsd: 2900,
      milestones: ["Complete", "Incomplete"],
      sheetAsOf: "2026-10-05",
    });
  });

  it("keeps an empty sheet cell unknown instead of calling it zero", () => {
    const [g] = resolveDaoGrants(
      ["A172"],
      sheetOf([
        row("Zcash East Africa August – October 2026 - $5000", {
          pendingUsdCents: 500_000n,
        }),
      ]),
      CATALOG,
    );
    expect(g.payout).toBe("sheet");
    expect(g.outstandingUsd).toBe(5000);
    expect(g).not.toHaveProperty("paidUsd");
  });

  it("falls back to the curated sheet figures, dated, when the sheet is unavailable", () => {
    const [g] = resolveDaoGrants(["A178"], null, CATALOG);
    expect(g).toMatchObject({
      payout: "fallback",
      paidUsd: 1500,
      outstandingUsd: 4300,
      sheetAsOf: DAO_SHEET_FALLBACK_AS_OF,
    });
  });

  it("falls back, dated, for a grant the live sheet no longer lists", () => {
    const [g] = resolveDaoGrants(
      ["A178"],
      sheetOf([row("Something else - $10")]),
      CATALOG,
    );
    expect(g).toMatchObject({
      payout: "fallback",
      paidUsd: 1500,
      sheetAsOf: DAO_SHEET_FALLBACK_AS_OF,
    });
  });

  it("claims nothing about payment for grants that predate the sheet", () => {
    const [g] = resolveDaoGrants(["A97"], sheetOf([]), CATALOG);
    expect(g.payout).toBe("unlisted");
    expect(g).not.toHaveProperty("paidUsd");
    expect(g).not.toHaveProperty("outstandingUsd");
    expect(g).not.toHaveProperty("sheetAsOf");
  });

  it("keeps the curated order and skips an unknown reference", () => {
    expect(
      resolveDaoGrants(["A97", "A999", "A178"], null, CATALOG).map(
        (g) => g.ref,
      ),
    ).toEqual(["A97", "A178"]);
  });
});

describe("applyDaoFunding", () => {
  const MEXICO = community("mexico", {
    funded: true,
    note: "umbrella",
    zechubDao: { proposals: ["A178"] },
  });
  const PLAIN = community("plain", { funded: false });

  it("overlays the imported sheet and reports its capture date", () => {
    const out = applyDaoFunding(
      [MEXICO, PLAIN],
      [
        row(ZECHUB_DAO_PROPOSALS.A178.sheet!.title, {
          paidUsdCents: 150_000n,
          pendingUsdCents: 430_000n,
          capturedOn: "2026-09-21",
        }),
      ],
    );
    expect(out.dao).toEqual({ source: "sheet", sheetAsOf: "2026-09-21" });
    expect(out.communities[0].zcg.zechubDao?.grants?.[0]).toMatchObject({
      ref: "A178",
      payout: "sheet",
      paidUsd: 1500,
      outstandingUsd: 4300,
    });
    expect(out.communities[0].zcg).toMatchObject({
      funded: true,
      note: "umbrella",
    });
    expect(out.communities[1]).toBe(PLAIN);
  });

  it("treats an empty or missing sheet as unavailable, never as 'nothing paid'", () => {
    for (const payouts of [null, []]) {
      const out = applyDaoFunding([MEXICO], payouts);
      expect(out.dao).toEqual({
        source: "fallback",
        sheetAsOf: DAO_SHEET_FALLBACK_AS_OF,
      });
      expect(out.communities[0].zcg.zechubDao?.grants?.[0]).toMatchObject({
        payout: "fallback",
        paidUsd: 1500,
      });
    }
  });

  it("never mutates the curated dataset", () => {
    const before = structuredClone(MEXICO);
    const out = applyDaoFunding([MEXICO], null);
    expect(MEXICO).toEqual(before);
    expect(out.communities[0]).not.toBe(MEXICO);
    expect(out.communities[0].links).toBe(MEXICO.links);
  });
});

describe("daoGrants", () => {
  it("resolves the curated fallback when no overlay ran", () => {
    expect(daoGrants({ funded: false })).toEqual([]);
    const grants = daoGrants({
      funded: false,
      zechubDao: { proposals: ["A178"] },
    });
    expect(grants.map((g) => [g.ref, g.payout])).toEqual([
      ["A178", "fallback"],
    ]);
  });
});

describe("curated ZecHub DAO mapping", () => {
  const mapped = COMMUNITIES.filter((c) => c.zcg.zechubDao);
  const byId = (id: string) => COMMUNITIES.find((c) => c.id === id);
  const refs = (id: string) => byId(id)?.zcg.zechubDao?.proposals;

  it("maps only proposals present in the verified catalog, each once", () => {
    const all = mapped.flatMap((c) => c.zcg.zechubDao!.proposals);
    expect(new Set(all).size).toBe(all.length);
    for (const ref of all) expect(ZECHUB_DAO_PROPOSALS[ref], ref).toBeDefined();
    for (const [ref, p] of Object.entries(ZECHUB_DAO_PROPOSALS)) {
      expect(p.ref).toBe(ref);
      expect(p.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("lists each community's grants oldest first", () => {
    for (const c of mapped) {
      const created = c.zcg.zechubDao!.proposals.map(
        (r) => ZECHUB_DAO_PROPOSALS[r].created,
      );
      expect(created, c.id).toEqual([...created].sort());
    }
  });

  it("maps the executed grants the research pass verified", () => {
    expect(refs("zcash-club-queretaro")).toEqual(["A178"]);
    expect(refs("zcash-brazil")).toEqual(["A45"]);
    expect(refs("zcash-nigeria")).toEqual(["A44"]);
    expect(refs("zcash-turkiye")).toEqual(["A48", "A50"]);
    expect(refs("zcash-arabia")).toEqual(expect.arrayContaining(["A72"]));
    expect(refs("zcash-east-africa")).toEqual(
      expect.arrayContaining(["A153", "A172"]),
    );
    expect(refs("zcash-ukraine")).toEqual(expect.arrayContaining(["A97"]));
    for (const id of ["zcash-india", "zcash-korea", "elzz-global-ambassador"])
      expect(refs(id)?.length, id).toBeGreaterThan(0);
  });

  it("renames the Querétaro club to Zcash México, keeping its local name", () => {
    expect(byId("zcash-club-queretaro")).toMatchObject({
      name: "Zcash México",
      localName: "Club Zcash Querétaro",
    });
  });

  it("dates the club from its founding (A178: born 24 Nov 2024) and credits ZCG #157 to the club, not to Zcash México", () => {
    const mx = byId("zcash-club-queretaro");
    expect(mx?.since).toBe(2024);
    expect(mx?.zcg.note).toMatch(/^Club Zcash Querétaro is named in .*#157/);
    expect(mx?.zcg.note).toMatch(/Zcash México has no ZCG grant of its own/);
    // Puebla meetups are the Oct–Nov 2026 plan, not a running activity.
    expect(mx?.about).toMatch(/Oct–Nov 2026 plan \(A178\) adds monthly meetups in Puebla/);
  });

  it("keeps about lines neutral about the funding channel where both channels fund a group", () => {
    for (const id of ["zcash-india", "zcash-east-africa"])
      expect(byId(id)?.about, id).not.toMatch(/ZecHub|DAO|ZCG|ambassador|funded/i);
  });

  it("gives every visible DAO line a dated period, and keeps nuance in the tooltip note", () => {
    const p = ZECHUB_DAO_PROPOSALS;
    expect(p.A48.period).toBe("Nov 2024");
    expect(p.A50.period).toBe("Dec 2024");
    expect(p.A44.period).toBe("Approved Sep 2024");
    expect(p.A128).toMatchObject({ period: "Dec 2025", requested: "1 ZEC, retroactive" });
    for (const q of Object.values(p))
      expect(q.period, q.ref).toMatch(/\b20\d\d\b/);
    expect(p.A113.note).toMatch(/leaves the outstanding amount blank/);
  });

  it("carries the dated sheet figures for every grant the sheet lists", () => {
    for (const p of Object.values(ZECHUB_DAO_PROPOSALS))
      if (p.sheet)
        expect(
          p.sheet.paidUsd !== null || p.sheet.outstandingUsd !== null,
          p.ref,
        ).toBe(true);
    expect(ZECHUB_DAO_PROPOSALS.A178.sheet).toEqual({
      title:
        "Club Zcash Querétaro - Zcash México (October-November 2026) - $5800",
      paidUsd: 1500,
      outstandingUsd: 4300,
    });
  });

  it("writes Ukraine's DAO funding in the past tense, naming the rejected 2026 proposals", () => {
    const dao = byId("zcash-ukraine")?.zcg.zechubDao;
    expect(dao?.note).toMatch(/A131/);
    expect(dao?.note).toMatch(/A133/);
    expect(dao?.note).toMatch(/rejected/);
    expect(byId("zcash-ukraine")?.zcg.note ?? "").not.toMatch(
      /Ambassador program funded/,
    );
  });

  it("describes East Africa's DAO grants as operations funding, not single events only", () => {
    const ea = byId("zcash-east-africa");
    const text = `${ea?.zcg.note ?? ""} ${ea?.zcg.zechubDao?.note ?? ""} ${ea?.about ?? ""}`;
    expect(text).not.toMatch(/not the community itself|one-off/);
    expect(ea?.zcg.zechubDao?.note).toMatch(/operations/);
  });
});
