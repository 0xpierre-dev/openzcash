import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
  notFound: () => { throw new Error("not-found"); },
}));
vi.mock("@/components/monthly/monthly-bundle", () => ({ MonthlyBundle: () => null }));
import IssuePage from "./page";

describe("retired Monthly issue", () => {
  it.each([[undefined, "monthly"], ["operations", "operations"], ["sources", "sources"], ["voter", "operations"], ["invalid", "monthly"]])("preserves the selected publication %s and starts at the new cover", async (publication, expected) => {
    await expect(IssuePage({ params: Promise.resolve({issue:"2026-09-01-to-10"}), searchParams: Promise.resolve({publication}) }))
      .rejects.toThrow(`redirect:/monthly/2026-09?publication=${expected}#1`);
  });
  it("keeps unknown editions unavailable", async () => {
    await expect(IssuePage({ params: Promise.resolve({issue:"2026-09-02-to-11"}), searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
  });
});
