import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import registry from "@/data/ecosystem/registry.json";
import snapshot from "@/data/ecosystem/snapshot.json";
import type { Catalog } from "@/lib/ecosystem/types";
import { EcosystemExplorer } from "./explorer";

const catalog = { registry, snapshot } as unknown as Catalog;
const render = (mode: "ecosystem" | "development") => renderToStaticMarkup(
  createElement(EcosystemExplorer, { catalog, mode }),
);

describe("compact catalog presentation", () => {
  it("ships real app links without preview-only flags or destinations", () => {
    const html = render("development");
    for (const href of ["/ecosystem", "/development", "/wallets", "/zcg/proposals", "/zcg/grants"])
      expect(html).toContain(`href="${href}"`);
    expect(html).not.toContain("Preview");
    expect(html).not.toContain("127.0.0.1");
    expect(html).not.toContain("Integration preview");
  });

  it.each(["ecosystem", "development"] as const)("uses the shared page header and stats in %s", mode => {
    const html = render(mode);
    expect(html).toContain(`${mode === "development" ? "Development" : "Ecosystem"}</h1>`);
    expect(html).toContain("text-2xl font-semibold tracking-tight text-stone-900");
    expect(html).toContain("Catalog statistics");
    expect(html).toContain("bg-clip-text text-transparent");
    expect(html).not.toContain("Follow the code.");
    expect(html).not.toContain("An ecosystem, connected.");
  });

  it("keeps funding, purpose, maintainer and lifecycle controls accessible", () => {
    const html = render("development");
    for (const label of ["Search repositories", "Filter by purpose", "Filter by maintainer", "Filter by funding", "Filter repository type"])
      expect(html).toContain(`aria-label="${label}"`);
    for (const days of [7, 30, 90]) expect(html).toContain(`aria-label="${days} days"`);
    expect(html).toContain("Former Dev Fund recipient");
    expect(html).toContain('aria-label="Development repositories"');
    expect(html).toContain('aria-label="Repository results"');
  });

  it("removes card descriptions but keeps categories, approvals and uniquely named detail controls", () => {
    const html = render("ecosystem");
    expect(html).not.toContain(catalog.registry.projects.find(project => project.id === "zebra")!.description);
    expect(html).toContain('aria-label="View Zebra"');
    expect(html).toContain('aria-label="View Zodl wallet"');
    expect(html).toContain("Grant history");
    expect(html).toContain("Grant approval ≠ payment or current funding");
  });

  it("retains snapshot and measurement limitations under sources", () => {
    const html = render("development");
    expect(html).toContain("Snapshot 08 Sept 2026");
    expect(html).toContain("Repository-wide totals · excludes forks");
    expect(html).toContain("Sources &amp; methodology");
    expect(html).toContain("Shared and multichain codebases may include non-Zcash work.");
    expect(html).toContain("Missing measurements appear as a dash.");
    expect(html).toContain('href="/api/ecosystem"');
  });
});
