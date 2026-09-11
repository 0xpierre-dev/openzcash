import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { editionSchema, monthlyEditions } from "./catalog";
import { fitPage, pageFromHash, pageManifestSchema, sourceUrl } from "./reader";

const publicFile = (path: string) => join(process.cwd(), "public", path);
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");

describe("monthly publication integrity", () => {
  it("has unique editions and at most one standard issue per publication month", () => {
    expect(new Set(monthlyEditions.map((e) => e.id)).size).toBe(monthlyEditions.length);
    const standard = monthlyEditions.filter((e) => e.kind === "monthly");
    expect(new Set(standard.map((e) => e.month)).size).toBe(standard.length);
  });

  for (const edition of monthlyEditions) {
    it(`${edition.id}: serves the exact reviewed PDF with its own complete page register`, () => {
      const pdf = readFileSync(publicFile(edition.pdf));
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.length).toBe(edition.bytes);
      expect(hash(pdf)).toBe(edition.sha256);
      expect(edition.assetBase).toContain(`/${edition.id}/${edition.sha256.slice(0, 12)}`);
      expect(existsSync(publicFile(edition.cover))).toBe(true);
      const pages = pageManifestSchema.parse(JSON.parse(readFileSync(publicFile(edition.manifest), "utf8")));
      expect(pages).toHaveLength(edition.pageCount);
      for (const [i, page] of pages.entries()) {
        expect(page.number).toBe(i + 1);
        expect(page.text.trim().length).toBeGreaterThan(0);
        expect(existsSync(publicFile(`${edition.assetBase}/page-${String(page.number).padStart(3, "0")}.jpg`))).toBe(true);
        for (const link of page.links) {
          expect(link.x + link.w).toBeLessThanOrEqual(1.001);
          expect(link.y + link.h).toBeLessThanOrEqual(1.001);
          if ("page" in link) expect(link.page).toBeLessThanOrEqual(edition.pageCount);
        }
      }
    });
  }

  it("keeps the wallet slide at page seven of the current design", () => {
    const latest = monthlyEditions[0];
    const pages = pageManifestSchema.parse(JSON.parse(readFileSync(publicFile(latest.manifest), "utf8")));
    expect(latest.designVersion).toBe("Editorial 3.7");
    expect(pages[6].section).toBe("Build & wallets");
    expect(pages[6].title.toLowerCase()).toContain("wallet");
    // ZODL and Zkool are wordmarks in the PDF, not text-layer names.
    // The importer checks all four authored identities before admitting a PDF.
  });

  it("keeps the PDF module, worker and fonts from the same pinned distribution", () => {
    const dir = publicFile("/monthly/pdfjs/5.6.205");
    const distribution = JSON.parse(readFileSync(join(dir, "distribution.json"), "utf8"));
    expect(distribution.version).toBe("5.6.205");
    expect(Object.keys(distribution.files)).toContain("pdf.worker.min.mjs");
    for (const [file, expected] of Object.entries(distribution.files)) expect(hash(readFileSync(join(dir, file)))).toBe(expected);
  });

  it("rejects inconsistent dates, external assets and changed page geometry", () => {
    const sample = monthlyEditions[0];
    for (const patch of [{ periodStart: "2027-01-01" }, { periodEnd: "2026-10-01" }, { pdf: "https://example.com/report.pdf" }, { pageWidth: 1920 }]) {
      expect(editionSchema.safeParse({ ...sample, ...patch }).success).toBe(false);
    }
  });
});

describe("reader navigation", () => {
  it("bounds deep links and rejects invalid page fragments", () => {
    expect(pageFromHash("#7", 44)).toBe(7);
    expect(pageFromHash("#999", 44)).toBe(44);
    for (const value of ["", "#0", "#-1", "#NaN", "#2.5", "#Infinity"]) expect(pageFromHash(value, 44)).toBe(1);
  });

  it.each([[1440, 900], [947, 533], [360, 580], [740, 210], [0, 0]])("fits the whole page in a %i × %i stage", (width, height) => {
    const fitted = fitPage(width, height);
    expect(fitted.width).toBeLessThanOrEqual(width);
    expect(fitted.height).toBeLessThanOrEqual(height);
    expect(fitted.width).toBeGreaterThanOrEqual(0);
    expect(fitted.height).toBeGreaterThanOrEqual(0);
    if (fitted.width) expect(Math.abs(fitted.width / (16 / 9) - fitted.height)).toBeLessThan(1);
  });

  it("only opens ordinary source links from the report", () => {
    expect(sourceUrl("https://openzcash.org/wallets")).toBe("https://openzcash.org/wallets");
    for (const value of ["javascript:alert(1)", "data:text/html,test", "//example.com", "/monthly", "https://user:password@example.com"]) expect(sourceUrl(value)).toBeNull();
  });
});
