import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Metadata } from "next";

const repo = vi.hoisted(() => ({ grantMilestones: vi.fn() }));
vi.mock("@/lib/zcg/grants-repo", () => repo);
vi.mock("@/lib/project-history/data", () => ({ projectHistoryDirectory: () => [] }));

import { generateMetadata } from "./page";

const metadataFor = (g: string) =>
  generateMetadata({ searchParams: Promise.resolve({ g }) }) as Promise<Metadata>;

function imageUrl(meta: Metadata): URL {
  const [image] = meta.openGraph?.images as { url: string }[];
  return new URL(image.url, "https://openzcash.org");
}

const SPOOF = "ZCG approved: claim your 50 ZEC grant at zcg-claims.example";

describe("grant link preview", () => {
  beforeEach(() => {
    repo.grantMilestones.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shares the generic card when the ledger has no grant by that name", async () => {
    repo.grantMilestones.mockResolvedValue([]);
    const meta = await metadataFor(SPOOF);
    expect(repo.grantMilestones).toHaveBeenCalledWith(SPOOF);
    expect(meta.openGraph).toMatchObject({ title: "Grant detail" });
    expect(meta.openGraph).not.toHaveProperty("url");
    expect(imageUrl(meta).searchParams.get("t")).toBe("Grant detail");
    expect(JSON.stringify(meta)).not.toContain("claim");
  });

  it("shares the generic card when the lookup fails", async () => {
    repo.grantMilestones.mockRejectedValue(new Error("db down"));
    const meta = await metadataFor("Zebra");
    expect(imageUrl(meta).searchParams.get("t")).toBe("Grant detail");
  });

  it("carries the stored name of a grant the ledger has", async () => {
    repo.grantMilestones.mockResolvedValue([
      { project: "Zebra", recipientNameRaw: "Zcash Foundation", sourceSheet: "zcg", isPaid: true },
      { project: "Zebra", recipientNameRaw: "Zcash Foundation", sourceSheet: "zcg", isPaid: false },
    ]);
    const meta = await metadataFor("Zebra");
    expect(meta.openGraph).toMatchObject({
      title: "Zebra · ZCG grant",
      url: "/zcg/grant?g=Zebra",
    });
    const card = imageUrl(meta).searchParams;
    expect(card.get("t")).toBe("Zebra");
    expect(card.get("k")).toBe("Grant to Zcash Foundation");
    expect(card.get("n")).toBe("1 of 2 milestones paid");
  });
});
