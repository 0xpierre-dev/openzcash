import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import registry from "@/data/ecosystem/registry.json";
import snapshot from "@/data/ecosystem/snapshot.json";
import {
  activitySummary, classifyRepositories, displayDate, filterProjects,
  filterRepositories, isGrantFunded, safeExternalUrl, validateCatalog,
} from "./catalog";
import type { Catalog, Project, Repository } from "./types";

const catalog = { registry, snapshot } as unknown as Catalog;
const filters = { query: "", category: "", organization: "", funding: "" };
const project = (status: string): Project => ({
  id: "sample", name: "Sample", organizationId: "zf", category: "Infrastructure",
  tags: ["Indexer"], description: "A public indexer", website: "https://example.org",
  repositories: ["old-owner/indexer"],
  funding: { label: "Historical decision", status: "historical", events: [
    { title: "Indexer grant", status, date: "2024-01-01", sourceUrl: "https://example.org/proposal" },
  ] }, sources: [{ title: "Source", url: "https://example.org" }],
});
const repository = (count: number | null, extra: Partial<Repository> = {}): Repository => ({
  id: "r1", fullName: "new-owner/indexer", name: "indexer", owner: "new-owner",
  url: "https://github.com/new-owner/indexer", description: "Indexing service", homepage: null,
  archived: false, fork: false, disabled: false, language: "Rust", topics: [], stars: 0,
  createdAt: "2023-01-01", pushedAt: "2026-09-08", defaultBranch: "main",
  sourceUrl: "https://api.github.com/repos/new-owner/indexer", aliases: ["old-owner/indexer"],
  activity: { checkedAt: "2026-09-08", since: { "30": "2026-08-09" }, commits: { "30": count },
    latestRelease: null, releases: [], sourceUrl: "https://github.com/new-owner/indexer/activity" },
  ...extra,
});

describe("funding provenance and classification", () => {
  it("requires an explicit positive project decision, not a proposal or organization award", () => {
    for (const status of ["Approved", "awarded", "paid"]) expect(isGrantFunded(project(status))).toBe(true);
    for (const status of ["not approved", "pending", "rejected", "organization-level", "unassessed"])
      expect(isGrantFunded(project(status))).toBe(false);
  });
  it("matches old repository aliases to the canonical identity without inventing an owner", () => {
    const result = classifyRepositories({ ...catalog,
      registry: { ...catalog.registry, projects: [project("approved")], organizations: [] },
      snapshot: { ...catalog.snapshot, repositories: [repository(12)] },
    });
    expect(result[0].projects.map(item => item.id)).toEqual(["sample"]);
    expect(result[0].category).toBe("Infrastructure");
    expect(result[0].organization).toBeNull();
    expect(result[0].classification).toBe("reviewed");
    expect(filterRepositories(result, { ...filters, funding: "grants", query: "INDEXER rust" })).toHaveLength(1);
  });
  it("retains archived and forked repositories but supports precise lifecycle filters", () => {
    const repos = classifyRepositories({ ...catalog, snapshot: { ...catalog.snapshot,
      repositories: [repository(1), repository(2, { id: "r2", archived: true }), repository(3, { id: "r3", fork: true })],
    } });
    expect(filterRepositories(repos, filters)).toHaveLength(3);
    expect(filterRepositories(repos, { ...filters, lifecycle: "original" }).map(repo => repo.id)).toEqual(["r1"]);
    expect(filterRepositories(repos, { ...filters, lifecycle: "archived" })[0].id).toBe("r2");
    expect(filterRepositories(repos, { ...filters, lifecycle: "forks" })[0].id).toBe("r3");
  });
  it("combines query and category filters without treating rejected grants as funded", () => {
    expect(filterProjects([project("approved")], { ...filters, query: "indexer", category: "Infrastructure" })).toHaveLength(1);
    expect(filterProjects([project("rejected")], { ...filters, funding: "grants" })).toHaveLength(0);
    expect(filterProjects([project("approved")], { ...filters, query: "wallet" })).toHaveLength(0);
  });
  it("recognizes the full Development Fund program name in the ZF history filter", () => {
    const repos = classifyRepositories(catalog);
    const expected = repos.filter(repo => repo.organization?.id === "zcash-foundation");
    expect(expected.length).toBeGreaterThan(0);
    expect(filterRepositories(repos, { ...filters, organization: "zcash-foundation", funding: "historical-dev-fund" }))
      .toHaveLength(expected.length);
    expect(filterRepositories(repos, { ...filters, organization: "shielded-labs", funding: "historical-dev-fund" }))
      .toHaveLength(0);
  });
});
describe("activity measurements", () => {
  it("does not inflate totals with forks or turn missing measurements into zero", () => {
    expect(activitySummary([repository(10), repository(100, { fork: true }), repository(null)], 30))
      .toEqual({ commits: 10, active: 1, releases: 0, measured: 1, eligible: 2 });
    expect(activitySummary([repository(0)], 30).measured).toBe(1);
    expect(activitySummary([repository(null)], 30).measured).toBe(0);
  });
  it("uses release publication dates and includes prerelease records", () => {
    const repo = repository(0);
    repo.activity!.releases = [
      { name: null, tagName: "v1", publishedAt: "2026-08-01", isPrerelease: false, url: "https://example.org/1" },
      { name: null, tagName: "v2-beta", publishedAt: "2026-09-01", isPrerelease: true, url: "https://example.org/2" },
    ];
    expect(activitySummary([repo], 30).releases).toBe(1);
  });
});
describe("public data safety and checked-in consistency", () => {
  it("rejects executable and credential-bearing links", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,example", "https://user:password@example.org", "/relative"])
      expect(safeExternalUrl(url)).toBeNull();
    expect(safeExternalUrl("https://github.com/zcash")).toBe("https://github.com/zcash");
    expect(displayDate("invalid")).toBe("Not available");
    expect(displayDate("2026-09-08T00:00:00Z")).toBe("08 Sept 2026");
  });
  it("validates source links, identities, categories and project owners", () => {
    expect(() => validateCatalog(catalog)).not.toThrow();
    expect(() => validateCatalog({ ...catalog, snapshot: { ...catalog.snapshot, repositories: [repository(-1)] } }))
      .toThrow("Invalid commit count");
  });
  it("publishes a snapshot from the exact reviewed registry", () => {
    expect(createHash("sha256").update(JSON.stringify(registry)).digest("hex")).toBe(snapshot.registryHash);
    expect(catalog.snapshot.owners.every(owner => owner.complete)).toBe(true);
  });
  it("retains every reviewed approval exactly once and maps core identities separately", () => {
    const review = catalog.registry.grantReview;
    expect(review.classification).toHaveLength(review.totalApproved);
    expect(new Set(review.classification.map(row => row.sourceUrl)).size).toBe(review.totalApproved);
    const zf = catalog.registry.organizations.find(org => org.id === "zcash-foundation")!;
    expect(zf.funding.status).toBe("historical-dev-fund");
    expect(zf.funding.history.some(event => event.until === "2024-11-23")).toBe(true);
    expect(catalog.registry.organizations.find(org => org.id === "zcash-core")!.funding.status).toBe("mixed");
  });
});
