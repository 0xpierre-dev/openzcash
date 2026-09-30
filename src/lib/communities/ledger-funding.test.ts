import { describe, expect, it } from "vitest";
import type { Community } from "./data";
import {
  applyLedgerFunding,
  ledgerDateLabel,
  type LedgerRecipientTotal,
} from "./ledger-funding";

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

function total(
  recipientName: string,
  over: Partial<LedgerRecipientTotal> = {},
): LedgerRecipientTotal {
  return {
    recipientName,
    externalUsdCents: 0n,
    externalPaidUsdCents: 0n,
    grantCount: 0,
    externalPaymentCount: 0,
    externalLastPaid: null,
    ...over,
  };
}

const ZECHUB = community("zechub", {
  funded: true,
  recipient: "ZecHub",
  budgetedUsd: 822392.43,
  grants: 5,
  lastPaid: "2026-08-03",
});

describe("applyLedgerFunding", () => {
  it("replaces the fallback figures with the ledger's budget, grants and last payment", () => {
    const { communities, source } = applyLedgerFunding(
      [ZECHUB],
      [
        total("ZecHub", {
          externalUsdCents: 82_239_243n,
          externalPaidUsdCents: 69_695_243n,
          grantCount: 5,
          externalPaymentCount: 40,
          externalLastPaid: "2026-09-03",
        }),
      ],
    );
    expect(source).toBe("ledger");
    expect(communities[0].zcg).toEqual({
      funded: true,
      recipient: "ZecHub",
      budgetedUsd: 822392.43,
      paidUsd: 696952.43,
      grants: 5,
      lastPaid: "2026-09-03",
    });
  });

  it("matches the curated recipient case-insensitively and through ledger aliases", () => {
    const [aliased, brazil] = applyLedgerFunding(
      [
        // A curated alias spelling ("@handle") must meet the ledger's
        // canonical row ("handle"); normalisation alone would miss it.
        community("aliased", { funded: false, recipient: "@robustfengbin" }),
        community("brazil", { funded: true, recipient: "Zcash  Brazil" }),
      ],
      [
        total("robustfengbin", { externalUsdCents: 100n, grantCount: 1 }),
        total("zcash brazil", {
          externalUsdCents: 65_595_543n,
          grantCount: 7,
          externalLastPaid: "2026-09-01",
        }),
      ],
    ).communities;
    expect(aliased.zcg).toMatchObject({ funded: true, budgetedUsd: 1 });
    expect(brazil.zcg).toMatchObject({
      funded: true,
      recipient: "Zcash  Brazil",
      budgetedUsd: 655955.43,
      grants: 7,
      lastPaid: "2026-09-01",
    });
  });

  it("sums every ledger row that folds into the same recipient, keeping the latest payment", () => {
    const [c] = applyLedgerFunding(
      [community("x", { funded: false, recipient: "RED.DEV INC" })],
      [
        total("RED.DEV INC", {
          externalUsdCents: 1_000n,
          externalPaidUsdCents: 1_000n,
          grantCount: 1,
          externalLastPaid: "2026-09-10",
        }),
        total("reddev", {
          externalUsdCents: 500n,
          externalPaidUsdCents: 200n,
          grantCount: 2,
          externalLastPaid: "2025-01-02",
        }),
      ],
    ).communities;
    expect(c.zcg).toMatchObject({
      funded: true,
      budgetedUsd: 15,
      paidUsd: 12,
      grants: 3,
      lastPaid: "2026-09-10",
    });
  });

  it("marks an approved grant with no payment yet as funded, without a last-paid date", () => {
    const [c] = applyLedgerFunding(
      [
        community("india", {
          funded: false,
          recipient: "Zcash India",
          zechubDao: { proposals: ["A175"] },
          note: "n",
        }),
      ],
      [total("Zcash India", { externalUsdCents: 2_030_000n, grantCount: 1 })],
    ).communities;
    expect(c.zcg).toEqual({
      funded: true,
      recipient: "Zcash India",
      zechubDao: { proposals: ["A175"] },
      note: "n",
      budgetedUsd: 20300,
      paidUsd: 0,
      grants: 1,
    });
  });

  it("treats a mapped recipient with no ecosystem rows as unfunded: the absence is information", () => {
    const [c] = applyLedgerFunding(
      [ZECHUB],
      [
        total("Somebody else", { externalUsdCents: 1n, grantCount: 1 }),
        // A committee stipend is not community funding.
        total("ZecHub", { grantCount: 0, externalUsdCents: 0n }),
      ],
    ).communities;
    expect(c.zcg).toEqual({ funded: false, recipient: "ZecHub" });
  });

  it("keeps curated funding for communities with no ledger recipient of their own", () => {
    const umbrella = community("caracas", {
      funded: true,
      note: "Funded through the Zcash en Español grant.",
    });
    const [c] = applyLedgerFunding(
      [umbrella],
      [total("ZecHub", { externalUsdCents: 1n, grantCount: 1 })],
    ).communities;
    expect(c.zcg).toEqual(umbrella.zcg);
  });

  it("falls back to the curated figures when the ledger is empty", () => {
    const result = applyLedgerFunding([ZECHUB], []);
    expect(result.source).toBe("fallback");
    expect(result.communities[0].zcg).toEqual(ZECHUB.zcg);
  });

  it("never mutates the curated dataset", () => {
    const before = structuredClone(ZECHUB);
    const { communities } = applyLedgerFunding(
      [ZECHUB],
      [total("ZecHub", { externalUsdCents: 5n, grantCount: 1 })],
    );
    expect(ZECHUB).toEqual(before);
    expect(communities[0]).not.toBe(ZECHUB);
    expect(communities[0].links).toBe(ZECHUB.links);
  });
});

describe("ledgerDateLabel", () => {
  it("formats a ledger date without shifting it through a timezone", () => {
    expect(ledgerDateLabel("2026-09-03")).toBe("3 Sep 2026");
    expect(ledgerDateLabel("2026-12-31")).toBe("31 Dec 2026");
  });
  it("returns anything that is not an ISO date unchanged", () => {
    expect(ledgerDateLabel("soon")).toBe("soon");
  });
});
