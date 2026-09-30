import { describe, expect, it } from "vitest";
import {
  compactUsd,
  daoLine,
  daoTitle,
  fundingBadges,
  fundingSummary,
  fundingTitle,
  matchesFunding,
  noneTitle,
  paidLine,
  paidLineTitle,
} from "./funding-display";
import type { CommunityZcg } from "./data";
import type { DaoGrant } from "./dao-proposals";

const LIVE_BRAZIL = {
  funded: true,
  recipient: "Zcash Brazil",
  budgetedUsd: 655955.43,
  paidUsd: 556620.43,
  grants: 7,
  lastPaid: "2026-09-01",
};
const grant = (over: Partial<DaoGrant> & { ref: string }): DaoGrant => ({
  title: `Proposal ${over.ref}`,
  created: "2026-01-01",
  period: "Sep–Dec 2026",
  requested: "$8,000",
  url: `https://daodao.zone/dao/x/proposals/${over.ref}`,
  payout: "unlisted",
  ...over,
});
// Live ledger: an approved grant with nothing paid yet, plus DAO funding.
const LIVE_INDIA: CommunityZcg = {
  funded: true,
  recipient: "Zcash India",
  zechubDao: {
    proposals: ["A151", "A175"],
    grants: [
      grant({
        ref: "A151",
        period: "Jun–Aug 2026",
        requested: "$4,800",
        payout: "sheet",
        paidUsd: 4800,
        outstandingUsd: 0,
        sheetAsOf: "2026-09-21",
      }),
      grant({
        ref: "A175",
        payout: "sheet",
        outstandingUsd: 8000,
        sheetAsOf: "2026-09-21",
      }),
    ],
  },
  budgetedUsd: 20300,
  paidUsd: 0,
  grants: 1,
};
// A partly paid grant, and a DAO-only community.
const MEXICO: CommunityZcg = {
  funded: true,
  note: "Named in grant #157.",
  zechubDao: {
    proposals: ["A178"],
    grants: [
      grant({
        ref: "A178",
        period: "Oct–Nov 2026",
        requested: "$5,800",
        payout: "sheet",
        paidUsd: 1500,
        outstandingUsd: 4300,
        sheetAsOf: "2026-09-21",
      }),
    ],
  },
};
const UKRAINE: CommunityZcg = {
  funded: false,
  zechubDao: {
    proposals: ["A90", "A97"],
    note: "2026 proposals A131 and A133 were rejected.",
    grants: [
      grant({ ref: "A90", period: "Jun–Aug 2025", requested: "30–36 ZEC" }),
      grant({ ref: "A97", period: "Sep–Nov 2025", requested: "65 ZEC" }),
    ],
  },
};
const FALLBACK_BRAZIL = {
  funded: true,
  recipient: "Zcash Brazil",
  budgetedUsd: 655955.43,
  grants: 7,
  lastPaid: "2026-08-03",
};

describe("fundingBadges", () => {
  it("keeps the ZecHub DAO badge next to ZCG-funded when a community has both", () => {
    expect(fundingBadges(LIVE_INDIA)).toEqual(["zcg", "dao"]);
  });
  it("shows a single badge otherwise", () => {
    expect(fundingBadges(LIVE_BRAZIL)).toEqual(["zcg"]);
    expect(fundingBadges(UKRAINE)).toEqual(["dao"]);
    expect(fundingBadges({ funded: false })).toEqual(["none"]);
  });
  it("needs at least one mapped proposal for the DAO badge", () => {
    expect(
      fundingBadges({ funded: false, zechubDao: { proposals: [] } }),
    ).toEqual(["none"]);
  });
});

describe("matchesFunding", () => {
  it("filters ZCG, ZecHub DAO and unfunded communities independently", () => {
    expect(matchesFunding(MEXICO, "zcg")).toBe(true);
    expect(matchesFunding(MEXICO, "dao")).toBe(true);
    expect(matchesFunding(MEXICO, "none")).toBe(false);
    expect(matchesFunding(UKRAINE, "zcg")).toBe(false);
    expect(matchesFunding(UKRAINE, "dao")).toBe(true);
    expect(matchesFunding({ funded: false }, "none")).toBe(true);
    expect(matchesFunding({ funded: false }, "dao")).toBe(false);
    expect(matchesFunding({ funded: false }, "all")).toBe(true);
  });
});

describe("daoLine", () => {
  it("names the latest grant and how much of it the sheet shows paid", () => {
    expect(daoLine(MEXICO)).toEqual({
      ref: "A178",
      url: "https://daodao.zone/dao/x/proposals/A178",
      text: "$1.5K of $5.8K paid",
      asOf: null,
    });
    expect(daoLine(LIVE_INDIA)).toMatchObject({
      ref: "A175",
      text: "$8K outstanding",
    });
  });
  it("says 'paid' for a settled grant", () => {
    const settled: CommunityZcg = {
      funded: false,
      zechubDao: {
        proposals: ["A151"],
        grants: [LIVE_INDIA.zechubDao!.grants![0]],
      },
    };
    expect(daoLine(settled)?.text).toBe("$4.8K paid");
  });
  it("falls back to the period for grants the sheet does not list", () => {
    expect(daoLine(UKRAINE)).toMatchObject({
      ref: "A97",
      text: "Sep–Nov 2025",
      asOf: null,
    });
  });
  it("dates figures that come from the curated fallback", () => {
    const fallback: CommunityZcg = {
      funded: false,
      zechubDao: {
        proposals: ["A178"],
        grants: [
          {
            ...MEXICO.zechubDao!.grants![0],
            payout: "fallback",
            sheetAsOf: "2026-09-21",
          },
        ],
      },
    };
    expect(daoLine(fallback)?.asOf).toBe("as of 21 Sep 2026");
  });
  it("is null without DAO grants", () => {
    expect(daoLine(LIVE_BRAZIL)).toBeNull();
  });
});

describe("daoTitle", () => {
  it("lists every grant with its period, amount and sheet figures, then the note", () => {
    expect(daoTitle(MEXICO)).toBe(
      [
        "ZecHub DAO grants (treasury sheet of 21 Sep 2026):",
        "A178 · Oct–Nov 2026 · $5,800 · $1,500 paid, $4,300 outstanding",
      ].join("\n"),
    );
    expect(daoTitle(UKRAINE)).toBe(
      [
        "ZecHub DAO grants:",
        "A90 · Jun–Aug 2025 · 30–36 ZEC",
        "A97 · Sep–Nov 2025 · 65 ZEC",
        "2026 proposals A131 and A133 were rejected.",
      ].join("\n"),
    );
  });
  it("marks curated figures with their date", () => {
    const fallback: CommunityZcg = {
      funded: false,
      zechubDao: {
        proposals: ["A178"],
        grants: [
          {
            ...MEXICO.zechubDao!.grants![0],
            payout: "fallback",
            sheetAsOf: "2026-09-21",
          },
        ],
      },
    };
    expect(daoTitle(fallback)).toBe(
      [
        "ZecHub DAO grants:",
        "A178 · Oct–Nov 2026 · $5,800 · $1,500 paid, $4,300 outstanding (treasury sheet as of 21 Sep 2026)",
      ].join("\n"),
    );
  });
  it("is undefined without DAO grants", () => {
    expect(daoTitle(LIVE_BRAZIL)).toBeUndefined();
  });
});

describe("noneTitle", () => {
  it("says what 'no funding' means, then the note", () => {
    expect(noneTitle({ funded: false })).toBe(
      "No ZCG ledger rows and no ZecHub DAO grant on record",
    );
    expect(noneTitle({ funded: false, note: "Self-declared unfunded." })).toBe(
      "No ZCG ledger rows and no ZecHub DAO grant on record · Self-declared unfunded.",
    );
  });
});

describe("paidLine", () => {
  it("dates the latest settled payment in either mode", () => {
    expect(paidLine(LIVE_BRAZIL, "ledger")).toBe("paid 1 Sep 2026");
    expect(paidLine(FALLBACK_BRAZIL, "fallback")).toBe("paid 3 Aug 2026");
  });
  it("says 'not yet paid' only when the live ledger says so", () => {
    expect(paidLine(LIVE_INDIA, "ledger")).toBe("not yet paid");
    expect(paidLine(LIVE_INDIA, "fallback")).toBeNull();
  });
  it("says nothing for unfunded or umbrella-funded communities", () => {
    expect(paidLine({ funded: false, recipient: "X" }, "ledger")).toBeNull();
    expect(paidLine({ funded: true, note: "umbrella" }, "ledger")).toBeNull();
  });
  it("titles the line by its state, never calling 'not yet paid' a payment", () => {
    expect(paidLineTitle(LIVE_BRAZIL)).toBe(
      "Latest settled payment in the ZCG ledger",
    );
    expect(paidLineTitle(LIVE_INDIA)).toBe(
      "No settled payment yet in the ZCG ledger",
    );
  });
});

describe("fundingTitle", () => {
  it("spells out the live ledger figures", () => {
    expect(fundingTitle(LIVE_BRAZIL, "ledger", "2026-08-23")).toBe(
      "Zcash Brazil in the ZCG ledger: $656K budgeted, $557K paid across 7 grants; last paid 2026-09-01",
    );
    expect(fundingTitle(LIVE_INDIA, "ledger", "2026-08-23")).toBe(
      "Zcash India in the ZCG ledger: $20K budgeted across 1 grant; no payment yet",
    );
  });
  it("dates the fallback figures instead of passing them off as current", () => {
    expect(fundingTitle(FALLBACK_BRAZIL, "fallback", "2026-08-23")).toBe(
      "Zcash Brazil in the ZCG ledger as of 23 Aug 2026: $656K budgeted across 7 grants; last paid 2026-08-03",
    );
  });
  it("falls back to the recipient and note when there are no figures", () => {
    expect(
      fundingTitle(
        { funded: true, note: "Umbrella grant." },
        "ledger",
        "2026-08-23",
      ),
    ).toBe("Umbrella grant.");
    expect(
      fundingTitle({ funded: false }, "ledger", "2026-08-23"),
    ).toBeUndefined();
  });
});

describe("fundingSummary", () => {
  it("names the ledger as live or as a dated fallback", () => {
    expect(fundingSummary(2_290_000, "ledger", "2026-08-23")).toBe(
      "$2.29M budgeted, per the audited ledger",
    );
    expect(fundingSummary(2_240_000, "fallback", "2026-08-23")).toBe(
      "$2.24M budgeted, ledger as of 23 Aug 2026",
    );
  });
});

describe("compactUsd", () => {
  it("rounds to the directory's compact form", () => {
    expect(compactUsd(2_294_000)).toBe("$2.29M");
    expect(compactUsd(20_300)).toBe("$20K");
    expect(compactUsd(950)).toBe("$950");
  });
  it("keeps one decimal below $10K, without a trailing .0", () => {
    expect(compactUsd(1_500)).toBe("$1.5K");
    expect(compactUsd(2_960)).toBe("$3K");
    expect(compactUsd(8_000)).toBe("$8K");
  });
});
