import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Metadata } from "next";

const repo = vi.hoisted(() => ({ recipientMilestones: vi.fn() }));
vi.mock("@/lib/zcg/grants-repo", () => repo);

import { generateMetadata } from "./page";

const metadataFor = (r: string) =>
  generateMetadata({ searchParams: Promise.resolve({ r }) }) as Promise<Metadata>;

function imageUrl(meta: Metadata): URL {
  const [image] = meta.openGraph?.images as { url: string }[];
  return new URL(image.url, "https://openzcash.org");
}

describe("recipient link preview", () => {
  beforeEach(() => {
    repo.recipientMilestones.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shares the generic card when the ledger has no recipient by that name", async () => {
    repo.recipientMilestones.mockResolvedValue([]);
    const meta = await metadataFor("Nobody Real");
    expect(meta.openGraph).toMatchObject({ title: "Recipient ledger" });
    expect(meta.openGraph).not.toHaveProperty("url");
    expect(imageUrl(meta).searchParams.get("t")).toBe("Recipient ledger");
    expect(JSON.stringify(meta)).not.toContain("Nobody");
  });

  it("shares the generic card when the lookup fails", async () => {
    repo.recipientMilestones.mockRejectedValue(new Error("db down"));
    const meta = await metadataFor("Zcash Foundation");
    expect(imageUrl(meta).searchParams.get("t")).toBe("Recipient ledger");
  });

  it("carries the name the ledger stores, not the spelling in the link", async () => {
    repo.recipientMilestones.mockResolvedValue([
      { recipientNameRaw: "Zcash Foundation", isPaid: true },
      { recipientNameRaw: "Zcash Foundation", isPaid: false },
    ]);
    const meta = await metadataFor("zcash   FOUNDATION");
    expect(repo.recipientMilestones).toHaveBeenCalledWith("zcash foundation");
    expect(meta.openGraph).toMatchObject({
      title: "Zcash Foundation · Recipient ledger",
      url: "/zcg/recipient?r=Zcash%20Foundation",
    });
    const card = imageUrl(meta).searchParams;
    expect(card.get("t")).toBe("Zcash Foundation");
    expect(card.get("n")).toBe("1 paid · 1 unpaid entries");
  });
});
