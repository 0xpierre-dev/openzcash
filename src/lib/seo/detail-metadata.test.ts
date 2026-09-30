import { describe, expect, it } from "vitest";
import type { Metadata } from "next";
import { grantMetadata, recipientMetadata } from "./detail-metadata";
import { SITE_URL } from "./page-metadata";

type Image = { url: string };

function cardOf(meta: Metadata): URLSearchParams {
  const images = meta.openGraph?.images as Image[];
  return new URL(images[0].url, SITE_URL).searchParams;
}

describe("grantMetadata", () => {
  it("shares the generic card, with no og:url, when the ledger has no such grant", () => {
    const meta = grantMetadata(null);
    expect(meta.title).toBe("Grant detail · OpenZcash");
    expect(meta.openGraph).toMatchObject({ title: "Grant detail" });
    expect(meta.openGraph).not.toHaveProperty("url");
    const card = cardOf(meta);
    expect(card.get("t")).toBe("Grant detail");
    expect(card.get("s")).toBe("ZCG");
    expect(card.has("n")).toBe(false);
  });

  it("puts the stored grant name on the card, in og:title and in og:url", () => {
    const meta = grantMetadata({
      name: "ZODL Q1 & Q2 2026 Core Protocol Development",
      recipient: "ZODL",
      coinholder: false,
      paid: 2,
      milestones: 4,
    });
    expect(meta.title).toBe("Grant detail · OpenZcash");
    expect(meta.openGraph).toMatchObject({
      title: "ZODL Q1 & Q2 2026 Core Protocol Development · ZCG grant",
      url: "/zcg/grant?g=ZODL%20Q1%20%26%20Q2%202026%20Core%20Protocol%20Development",
    });
    const card = cardOf(meta);
    expect(card.get("t")).toBe("ZODL Q1 & Q2 2026 Core Protocol Development");
    expect(card.get("k")).toBe("Grant to ZODL");
    expect(card.get("n")).toBe("2 of 4 milestones paid");
    expect(card.get("s")).toBe("ZCG");
  });

  it("names the Coinholder program and a single milestone", () => {
    const meta = grantMetadata({
      name: "Zcash Arborist Calls",
      recipient: null,
      coinholder: true,
      paid: 0,
      milestones: 1,
    });
    expect(meta.openGraph).toMatchObject({
      title: "Zcash Arborist Calls · Coinholder grant",
    });
    const card = cardOf(meta);
    expect(card.get("s")).toBe("Coinholder Grants");
    expect(card.get("k")).toBe("Grant detail");
    expect(card.get("n")).toBe("0 of 1 milestone paid");
  });
});

describe("recipientMetadata", () => {
  it("shares the generic card, with no og:url, when the ledger has no such recipient", () => {
    const meta = recipientMetadata(null);
    expect(meta.openGraph).toMatchObject({ title: "Recipient ledger" });
    expect(meta.openGraph).not.toHaveProperty("url");
    expect(cardOf(meta).get("t")).toBe("Recipient ledger");
  });

  it("puts the canonical recipient name on the card, in og:title and in og:url", () => {
    const meta = recipientMetadata({
      name: "Zcash Foundation",
      paid: 12,
      unpaid: 3,
    });
    expect(meta.title).toBe("Recipient ledger · OpenZcash");
    expect(meta.openGraph).toMatchObject({
      title: "Zcash Foundation · Recipient ledger",
      url: "/zcg/recipient?r=Zcash%20Foundation",
    });
    const card = cardOf(meta);
    expect(card.get("t")).toBe("Zcash Foundation");
    expect(card.get("n")).toBe("12 paid · 3 unpaid entries");
  });
});
