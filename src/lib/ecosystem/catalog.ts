import type { Catalog, ClassifiedRepository, Organization, Project, Repository } from "./types";

export const CATEGORIES = [
  "Nodes", "Wallets", "Libraries & SDKs", "Cryptography", "Infrastructure",
  "Protocol", "Developer tools", "Payments & DeFi", "Identity",
  "Community", "Education", "Research", "Historical", "Other",
] as const;

export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.href : null;
  } catch { return null; }
}

export function displayDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not available";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(value));
}

function inferCategory(repo: Repository): string {
  const text = [repo.name, repo.description, ...repo.topics].join(" ").toLowerCase();
  if (/orchard|sapling|halo.?2|frost|jubjub|bellman|pairing|pasta|cryptograph|zero.knowledge proof/.test(text)) return "Cryptography";
  if (/lightwalletd|indexer|explorer|zaino|zinder|rpc|infrastructure/.test(text)) return "Infrastructure";
  if (/sdk|librar|binding|uniffi|ffi|crate/.test(text)) return "Libraries & SDKs";
  if (/wallet|zodl|zashi|zecwallet|zwallet/.test(text)) return "Wallets";
  if (/\bnode\b|zebra|zakura|zcashd/.test(text)) return "Nodes";
  if (/payment|btcpay|swap|bridge|merchant|defi|zsa/.test(text)) return "Payments & DeFi";
  if (/zcash improvement|protocol|consensus|\bzips\b|crosslink|tachyon/.test(text)) return "Protocol";
  if (/identity|name service|zns/.test(text)) return "Identity";
  if (/research|experiment|prototype|simulation/.test(text)) return "Research";
  if (/book|wiki|education|tutorial|documentation|website|\.github\.io/.test(text)) return "Education";
  if (/community|social|forum|governance/.test(text)) return "Community";
  if (/test|tool|ci\b|build|docker|devnet|regtest|deploy/.test(text)) return "Developer tools";
  return "Other";
}

export function classifyRepositories(catalog: Catalog): ClassifiedRepository[] {
  return catalog.snapshot.repositories.map(repo => {
    const names = new Set([repo.fullName, ...repo.aliases].map(name => name.toLowerCase()));
    const projects = catalog.registry.projects.filter(project =>
      project.repositories.some(name => names.has(name.toLowerCase())));
    const organization = catalog.registry.organizations.find(org =>
      org.githubOwners.some(owner => owner.toLowerCase() === repo.owner.toLowerCase())) || null;
    const category = projects[0]?.category || inferCategory(repo);
    return {
      ...repo, projects, organization, category,
      classification: projects.length ? "reviewed" : "inferred",
      tags: [...new Set([
        category,
        ...projects.flatMap(project => project.tags),
        ...(repo.archived ? ["Archived"] : []),
        ...(repo.fork ? ["Fork"] : []),
        ...(repo.disabled ? ["Disabled"] : []),
      ])],
    };
  });
}

export type Filters = {
  query: string;
  category: string;
  organization: string;
  funding: string;
  lifecycle?: string;
};

function matchesQuery(query: string, values: (string | null | undefined)[]): boolean {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean).every(term => haystack.includes(term));
}

export function isGrantFunded(project: Project): boolean {
  // Only an explicit positive decision associated with this product qualifies.
  // Funding of an owner or a similar-titled application is not substituted.
  return project.funding.events.some(event =>
    /^(approved|awarded|funded|paid)$/i.test(event.status));
}

export function filterRepositories(repositories: ClassifiedRepository[], filters: Filters) {
  return repositories.filter(repo => {
    if (filters.category && repo.category !== filters.category) return false;
    if (filters.organization && repo.organization?.id !== filters.organization) return false;
    if (filters.funding === "grants" && !repo.projects.some(isGrantFunded)) return false;
    if (filters.funding === "historical-dev-fund" &&
      !repo.organization?.funding.history.some(event => /(?:development|dev)[\s-]*fund/i.test(event.program || event.label))) return false;
    if (filters.lifecycle === "original" && (repo.fork || repo.archived)) return false;
    if (filters.lifecycle === "archived" && !repo.archived) return false;
    if (filters.lifecycle === "forks" && !repo.fork) return false;
    return matchesQuery(filters.query, [
      repo.fullName, repo.description, repo.organization?.name,
      repo.language, ...repo.tags, ...repo.topics,
      ...repo.projects.map(project => project.name),
    ]);
  });
}

export function filterProjects(projects: Project[], filters: Filters, organizations: Organization[] = []) {
  return projects.filter(project => {
    if (filters.category && project.category !== filters.category) return false;
    if (filters.organization && project.organizationId !== filters.organization) return false;
    if (filters.funding === "grants" && !isGrantFunded(project)) return false;
    return matchesQuery(filters.query, [
      project.name, project.description, project.category, ...project.tags,
      organizations.find(org => org.id === project.organizationId)?.name,
      ...project.repositories,
    ]);
  });
}

export function activitySummary(repositories: Repository[], days: number) {
  // Fork history often repeats upstream commits. Keep forks in the inventory,
  // but never inflate the headline activity totals with their duplicate history.
  const original = repositories.filter(repo => !repo.fork);
  const measured = original.filter(repo => typeof repo.activity?.commits[String(days)] === "number");
  const commits = measured.reduce((sum, repo) => sum + (repo.activity!.commits[String(days)] || 0), 0);
  const active = measured.filter(repo => (repo.activity!.commits[String(days)] || 0) > 0).length;
  const releases = original.flatMap(repo => {
    const since = repo.activity?.since[String(days)];
    return since ? repo.activity!.releases.filter(release => release.publishedAt >= since) : [];
  }).length;
  return { commits, active, releases, measured: measured.length, eligible: original.length };
}

export function relatedRepositories(project: Project, repositories: ClassifiedRepository[]) {
  return repositories.filter(repo => repo.projects.some(item => item.id === project.id));
}

export function validateCatalog(catalog: Catalog): void {
  if (catalog.registry.schemaVersion !== 1 || catalog.snapshot.schemaVersion !== 1)
    throw new Error("Unsupported ecosystem catalog schema");
  if (!Number.isFinite(Date.parse(catalog.snapshot.collectedAt)))
    throw new Error("Catalog collection date is missing");
  for (const [name, items] of [
    ["projects", catalog.registry.projects],
    ["organizations", catalog.registry.organizations],
    ["repositories", catalog.snapshot.repositories],
  ] as const) {
    if (new Set(items.map(item => item.id)).size !== items.length)
      throw new Error("Duplicate catalog IDs in " + name);
  }
  if (!catalog.snapshot.repositories.length) throw new Error("Empty ecosystem repository snapshot");
  for (const project of catalog.registry.projects) {
    if (project.organizationId && !catalog.registry.organizations.some(org => org.id === project.organizationId))
      throw new Error("Unknown project organization: " + project.id);
    if (!CATEGORIES.includes(project.category as typeof CATEGORIES[number]))
      throw new Error("Unknown project category: " + project.id);
    if (!project.sources.length || project.sources.some(source => !safeExternalUrl(source.url)) ||
      project.funding.events.some(event => !safeExternalUrl(event.sourceUrl) ||
        (event.repositoryEvidenceUrl && !safeExternalUrl(event.repositoryEvidenceUrl))))
      throw new Error("Invalid project provenance: " + project.id);
    if (project.relatedProjectIds?.some(id => !catalog.registry.projects.some(item => item.id === id)))
      throw new Error("Unknown related project: " + project.id);
  }
  for (const proposal of catalog.registry.grantReview.classification) {
    if (proposal.projectId && !catalog.registry.projects.some(project => project.id === proposal.projectId))
      throw new Error("Unknown proposal project: " + proposal.projectId);
  }
  for (const repo of catalog.snapshot.repositories) {
    if (!safeExternalUrl(repo.url) || !safeExternalUrl(repo.sourceUrl))
      throw new Error("Invalid repository source URL");
    for (const count of Object.values(repo.activity?.commits || {})) {
      if (count !== null && (!Number.isSafeInteger(count) || count < 0))
        throw new Error("Invalid commit count");
    }
  }
}
