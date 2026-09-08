"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Catalog, ClassifiedRepository, FundingEvent, Organization, Project, Source } from "@/lib/ecosystem/types";
import {
  activitySummary, classifyRepositories, displayDate, filterProjects,
  filterRepositories, isGrantFunded, relatedRepositories, safeExternalUrl,
} from "@/lib/ecosystem/catalog";
import styles from "./explorer.module.css";

type Mode = "ecosystem" | "development";
type Selection = { kind: "project"; value: Project } |
  { kind: "repository"; value: ClassifiedRepository } |
  { kind: "organization"; value: Organization };
const number = new Intl.NumberFormat("en-US");

function External({ url, children, className }: {
  url: string | null | undefined; children: React.ReactNode; className?: string;
}) {
  const safe = safeExternalUrl(url);
  return safe
    ? <a href={safe} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
    : <span className={className}>{children}</span>;
}

function Badge({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return <span className={styles.badge + (muted ? " " + styles.mutedBadge : "")}>{children}</span>;
}

function Mark({ project }: { project: Project }) {
  const initials = project.name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/)
    .map(word => word[0]).slice(0, 2).join("").toUpperCase();
  return <span className={styles.mark} aria-hidden="true">
    {project.logo ? <Image src={project.logo} width={29} height={29} alt="" unoptimized /> : initials}
  </span>;
}

function FundingEvents({ events }: { events: FundingEvent[] }) {
  if (!events.length) return <p>No project-specific funding decision mapped in this catalog.</p>;
  return <>{events.map((event, index) =>
    <div className={styles.event} key={event.sourceUrl + event.title + index}>
      <strong>{event.title}</strong>
      <div className={styles.small}>{event.status} · {displayDate(event.date)}</div>
      {event.dateNote && <div className={styles.small}>{event.dateNote}</div>}
      <External url={event.sourceUrl}>Decision source ↗</External>
      {event.scopeSourceUrl && <> · <External url={event.scopeSourceUrl}>Proposal scope ↗</External></>}
      {event.repositoryEvidenceUrl && <> · <External url={event.repositoryEvidenceUrl}>Repository association ↗</External></>}
      {event.associationNote && <div className={styles.small}>{event.associationNote}</div>}
    </div>)}
    <p>These are recorded funding decisions. An approval does not establish payment, delivery or continuing support.</p>
  </>;
}

function Sources({ sources }: { sources: Source[] }) {
  const unique = sources.filter((source, index) =>
    sources.findIndex(other => other.url === source.url) === index);
  return <div className={styles.dialogLinks}>{unique.map(source =>
    <External key={source.url} url={source.url}>{source.title} ↗</External>)}</div>;
}

function OrganizationFunding({ organization }: { organization: Organization }) {
  return <>
    <p>{organization.funding.label}</p>
    {organization.funding.history.map((event, index) =>
      <div className={styles.event} key={event.sourceUrl + index}>
        <strong>{event.label}</strong>
        <div className={styles.small}>{event.program}
          {event.from ? " · " + displayDate(event.from) : ""}
          {event.until ? " — " + displayDate(event.until) : ""}
        </div>
        <External url={event.sourceUrl}>Funding source ↗</External>
      </div>)}
  </>;
}

function DetailDialog({ selection, close, repositories, organizations, projects }: {
  selection: Selection | null; close: () => void;
  repositories: ClassifiedRepository[]; organizations: Organization[]; projects: Project[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (selection && dialog && !dialog.open) dialog.showModal();
    if (!selection && dialog?.open) dialog.close();
  }, [selection]);
  const title = selection?.kind === "repository" ? selection.value.fullName : selection?.value.name;
  return <dialog ref={ref} className={styles.dialog} onClose={close} aria-labelledby="catalog-dialog-title"
    onClick={event => {
      if (event.target !== ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }}>
    <div className={styles.dialogHeader}><h2 id="catalog-dialog-title">{title}</h2>
      <button type="button" onClick={close} aria-label="Close details">×</button></div>
    {selection?.kind === "project" && (() => {
      const project = selection.value;
      const repos = relatedRepositories(project, repositories);
      const org = organizations.find(item => item.id === project.organizationId);
      return <>
        <div className={styles.badges}><Badge>{project.category}</Badge>
          {project.tags.map(tag => <Badge key={tag} muted>{tag}</Badge>)}</div>
        <p>{project.description}</p>
        <div className={styles.dialogLinks}><External url={project.website}>Project website ↗</External>
          <Link href={"/development?project=" + encodeURIComponent(project.id)}>View development →</Link></div>
        <h3>GitHub repositories · {repos.length}</h3>
        {repos.map(repo => <div className={styles.event} key={repo.id}>
          <External url={repo.url}><strong>{repo.fullName} ↗</strong></External>
          <div className={styles.small}>{repo.language || "Language not reported"}
            {repo.archived ? " · Archived" : ""}{repo.fork ? " · Fork" : ""}
            {" · Last push " + displayDate(repo.pushedAt)}</div>
        </div>)}
        {!repos.length && <p>No GitHub repository with verified current metadata is associated. Other public source links appear below.</p>}
        {!!project.relatedProjectIds?.length && <>
          <h3>Related components</h3><div className={styles.dialogLinks}>
            {projects.filter(item => project.relatedProjectIds!.includes(item.id)).map(item =>
              <Link key={item.id} href={"/development?project=" + encodeURIComponent(item.id)}>{item.name} →</Link>)}
          </div></>}
        <h3>Project funding history</h3><FundingEvents events={project.funding.events} />
        {project.funding.scopeNote && <p>{project.funding.scopeNote}</p>}
        {org && <><h3>Maintainer / namespace · {org.name}</h3><OrganizationFunding organization={org} />
          <p>Organization funding history is not a grant award to each repository.</p></>}
        <h3>Sources</h3><Sources sources={project.sources} />
      </>;
    })()}
    {selection?.kind === "repository" && (() => {
      const repo = selection.value;
      return <>
        <div className={styles.badges}><Badge>{repo.category}</Badge>
          {repo.archived && <Badge muted>Archived</Badge>}{repo.fork && <Badge muted>Fork</Badge>}
          {repo.language && <Badge muted>{repo.language}</Badge>}</div>
        <p>{repo.description || "No description supplied by the maintainer."}</p>
        <div className={styles.dialogLinks}><External url={repo.url}>Repository ↗</External>
          <External url={repo.url + "/commits/" + encodeURIComponent(repo.defaultBranch || "")}>Commit history ↗</External>
          <External url={repo.url + "/releases"}>Releases ↗</External></div>
        <h3>What is being measured</h3>
        <p>Commits reachable from the current default branch ({repo.defaultBranch || "not available"}) in the selected time window.
          Fork histories are visible here but excluded from headline totals. Activity is not a measure of code quality or delivered work.</p>
        <div className={styles.event}><strong>Last push · {displayDate(repo.pushedAt)}</strong>
          <div className={styles.small}>Activity collected {displayDate(repo.activity?.checkedAt)}</div></div>
        {repo.activity?.latestRelease && <div className={styles.event}>
          <strong>{repo.activity.latestRelease.tagName}</strong>
          <div className={styles.small}>{displayDate(repo.activity.latestRelease.publishedAt)}
            {repo.activity.latestRelease.isPrerelease ? " · Prerelease" : ""}</div>
          <External url={repo.activity.latestRelease.url}>GitHub release marker ↗</External>
        </div>}
        <p>A GitHub release marker can be a beta or a repository notice; it does not establish a stable package or a deployment.</p>
        <h3>Project associations</h3>
        {repo.projects.length ? repo.projects.map(project =>
          <div className={styles.event} key={project.id}><strong>{project.name}</strong>
            <FundingEvents events={project.funding.events} /></div>)
          : <p>This repository is included by its public owner inventory. A product-specific funding association has not been established.</p>}
        {repo.organization && <><h3>{repo.organization.name} · organization funding</h3>
          <OrganizationFunding organization={repo.organization} /></>}
        <h3>Classification & provenance</h3>
        <p>{repo.classification === "reviewed"
          ? "Purpose comes from a reviewed project record linked to this repository."
          : "Purpose is inferred from the repository name, description and topics. It is an organizational aid, not an independently reviewed product claim."}</p>
        {repo.aliases.length > 0 && <p>Also found through: {repo.aliases.join(", ")}.</p>}
        <Sources sources={[{ title: "GitHub metadata", url: repo.sourceUrl },
          ...(repo.organization?.sources || [])]} />
      </>;
    })()}
    {selection?.kind === "organization" && <>
      <p>{selection.value.description}</p>
      <p>GitHub: {selection.value.githubOwners.join(", ")}</p>
      <h3>Funding history & current disclosures</h3>
      <OrganizationFunding organization={selection.value} />
      <h3>Primary sources</h3><Sources sources={selection.value.sources} />
    </>}
  </dialog>;
}

export function EcosystemExplorer({ catalog, mode }: { catalog: Catalog; mode: Mode }) {
  const repositories = useMemo(() => classifyRepositories(catalog), [catalog]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [organization, setOrganization] = useState("");
  const [funding, setFunding] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [period, setPeriod] = useState(30);
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  useEffect(() => {
    // URL filters are applied after hydration, so server and client markup
    // begin identically and direct links from project details remain usable.
    const params = new URLSearchParams(window.location.search);
    const project = params.get("project");
    if (project && catalog.registry.projects.some(item => item.id === project)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProjectId(project);
    }
  }, [catalog.registry.projects]);
  const isDevelopment = mode === "development";
  const filters = { query, category, organization, funding, lifecycle };
  const matchingRepos = filterRepositories(repositories, filters)
    .filter(repo => !projectId || repo.projects.some(project => project.id === projectId))
    .sort((a, b) => (b.activity?.commits[String(period)] ?? -1) -
      (a.activity?.commits[String(period)] ?? -1) ||
      (b.pushedAt || "").localeCompare(a.pushedAt || "") || a.fullName.localeCompare(b.fullName));
  const featured = ["zebra", "zakura", "zodl-wallet", "librustzcash", "shielded-crosslink", "zingo-wallet", "zaino", "frost", "qedit-zsa"];
  const matchingProjects = filterProjects(catalog.registry.projects, filters, catalog.registry.organizations)
    .filter(project => !projectId || project.id === projectId)
    .sort((a, b) => (featured.includes(a.id) ? featured.indexOf(a.id) : 100) -
      (featured.includes(b.id) ? featured.indexOf(b.id) : 100) || a.name.localeCompare(b.name));
  const resultCount = isDevelopment ? matchingRepos.length : matchingProjects.length;
  const perPage = isDevelopment ? 30 : 24;
  const pages = Math.max(1, Math.ceil(resultCount / perPage));
  const visiblePage = Math.min(page, pages);
  const start = (visiblePage - 1) * perPage;
  const stats = activitySummary(matchingRepos, period);
  const categories = [...new Set((isDevelopment ? repositories : catalog.registry.projects)
    .map(item => item.category))].sort();
  const organizations = catalog.registry.organizations.filter(org =>
    isDevelopment ? repositories.some(repo => repo.organization?.id === org.id) :
      catalog.registry.projects.some(project => project.organizationId === org.id));
  const coreOrganizations = catalog.registry.organizations.filter(org =>
    ["zcash-foundation", "zodl", "zakura", "shielded-labs", "ecc", "zcash-core"].includes(org.id));
  const selectedProject = catalog.registry.projects.find(project => project.id === projectId);
  const update = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };
  function clearFilters() {
    setQuery(""); setCategory(""); setOrganization(""); setFunding(""); setLifecycle(""); setProjectId(null); setPage(1);
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  }
  const measuredPercent = stats.eligible ? Math.round(stats.measured / stats.eligible * 100) : 0;
  const num = (value: number) => number.format(value);

  return <div className={styles.explorer}>
    <nav className={styles.tabs} aria-label="Ecosystem apps">
      <Link href="/ecosystem" aria-current={!isDevelopment ? "page" : undefined}>Ecosystem</Link>
      <Link href="/development" aria-current={isDevelopment ? "page" : undefined}>Development</Link>
      <Link href="/wallets">Wallets ↗</Link>
    </nav>
    <header className={styles.heading}>
      <div><div className={styles.eyebrow}>Open-source Zcash</div>
        <h1>{isDevelopment ? "Follow the code." : "An ecosystem, connected."}</h1>
        <p>{isDevelopment
          ? "Public repositories across Zcash teams and grant-funded projects. Explore what each one does, who maintains it and how its code is changing."
          : "Discover the projects building on Zcash — from protocol research and full nodes to wallets, payments and developer tools."}</p>
      </div>
      <div className={styles.snapshot}><strong>Source snapshot</strong>{displayDate(catalog.snapshot.collectedAt)}
        <div>{num(catalog.snapshot.owners.filter(owner => owner.complete).length)} full account inventories</div></div>
    </header>

    <div className={styles.stats} aria-label="Catalog statistics">
      {(isDevelopment ? [
        [num(matchingRepos.length), "Repositories in this view"],
        [stats.measured ? num(stats.commits) : "—", "Default-branch commits · " + period + " days"],
        [stats.measured ? num(stats.active) : "—", "Repositories with commits · no forks"],
        [stats.measured ? num(stats.releases) : "—", "Published release records · " + period + " days"],
      ] : [
        [num(catalog.registry.projects.length), "Mapped projects & components"],
        [num(repositories.length), "Canonical public repositories"],
        [num(catalog.registry.organizations.length), "Teams & maintainer accounts"],
        [num(catalog.registry.projects.filter(isGrantFunded).length), "Projects with recorded grant approvals"],
      ]).map(([value, label]) => <div className={styles.stat} key={label}><strong>{value}</strong><span>{label}</span></div>)}
    </div>

    <div className={styles.filters}>
      <div className={styles.filterTop}>
        <label className={styles.search}><span aria-hidden="true">⌕</span>
          <input type="search" value={query} onChange={event => update(setQuery, event.target.value)}
            placeholder={isDevelopment ? "Search repositories, projects, languages…" : "Search projects, tools and teams…"}
            aria-label={isDevelopment ? "Search repositories" : "Search projects"} /></label>
        {isDevelopment && <div className={styles.periods} role="group" aria-label="Activity period">
          {[7, 30, 90].map(days => <button key={days} aria-pressed={period === days}
            onClick={() => { setPeriod(days); setPage(1); }}>{days} days</button>)}</div>}
      </div>
      <div className={styles.selects}>
        <label>Maintainer<select value={organization} onChange={event => update(setOrganization, event.target.value)}
          aria-label="Filter by maintainer"><option value="">All maintainers</option>
          {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
        <label>Funding evidence<select value={funding} onChange={event => update(setFunding, event.target.value)}
          aria-label="Filter by funding"><option value="">All funding histories</option>
          <option value="grants">Recorded grant approval</option>
          {isDevelopment && <option value="historical-dev-fund">Former Dev Fund recipient</option>}
        </select></label>
        {isDevelopment && <label>Repository type<select value={lifecycle}
          onChange={event => update(setLifecycle, event.target.value)} aria-label="Filter repository type">
          <option value="">All · including historical</option><option value="original">Original · not archived</option>
          <option value="archived">Archived</option><option value="forks">Forks</option>
        </select></label>}
      </div>
      <div className={styles.chips} role="group" aria-label="Purpose tags">
        <button className={styles.chip} aria-pressed={!category} onClick={() => update(setCategory, "")}>All purposes</button>
        {categories.map(item => <button key={item} className={styles.chip} aria-pressed={category === item}
          onClick={() => update(setCategory, item)}>{item}</button>)}
      </div>
    </div>
    <div className={styles.caption}><span aria-live="polite">
      <strong>{num(resultCount)} {isDevelopment ? "repositories" : "projects & components"}</strong>
      {selectedProject && " · " + selectedProject.name}
      {isDevelopment && stats.eligible > 0 && " · Activity available for " + measuredPercent + "% of original repositories"}
    </span>{(query || category || organization || funding || lifecycle || projectId) &&
      <button className={styles.textButton} onClick={clearFilters}>Clear filters</button>}</div>
    {isDevelopment && <p className={styles.small + " mb-4"}>Repository-wide activity. Shared and multichain codebases may include non-Zcash work; totals exclude forks.</p>}

    {resultCount === 0 ? <div className={styles.empty}><h2>No matches in this view</h2>
      <p>Try another project name, purpose or maintainer.</p>
      <button className={styles.textButton} onClick={clearFilters}>Clear filters</button></div>
      : isDevelopment ? <div className={styles.tablePanel}><div className={styles.tableScroll}>
        <table className={styles.table}><thead><tr>
          <th scope="col">Repository / maintainer</th><th scope="col">Purpose</th>
          <th scope="col">Commits · {period}d</th><th scope="col">Last push</th><th scope="col">Latest release marker</th>
        </tr></thead><tbody>{matchingRepos.slice(start, start + perPage).map(repo => {
          const count = repo.activity?.commits[String(period)];
          const release = repo.activity?.latestRelease;
          return <tr key={repo.id}><td><div className={styles.repoOwner}>{repo.owner}</div>
            <button className={styles.repoTitle} onClick={() => setSelection({ kind: "repository", value: repo })}>
              {repo.name} <span aria-hidden="true">↗</span></button>
            <div className={styles.repoDescription}>{repo.description.slice(0, 150)}{repo.description.length > 150 ? "…" : ""}</div>
            <div className={styles.repoMeta}>
              {repo.language && <span className={styles.small}>{repo.language}</span>}
              {repo.archived && <Badge muted>Archived</Badge>}{repo.fork && <Badge muted>Fork</Badge>}
              {repo.projects.some(isGrantFunded) && <Badge>Grant history</Badge>}
            </div></td><td><Badge>{repo.category}</Badge>
              <div className={styles.small}>{repo.classification === "reviewed" ? "Source mapped" : "Inferred tag"}</div></td>
            <td><span className={styles.numeric}>{typeof count === "number" ? num(count) : "—"}</span>
              {repo.fork && <div className={styles.small}>Excluded from totals</div>}</td>
            <td><span className={styles.small}>{displayDate(repo.pushedAt)}</span></td>
            <td>{release ? <><External className={styles.release} url={release.url}>{release.tagName} ↗</External>
              <div className={styles.small}>{displayDate(release.publishedAt)}</div>
              {release.isPrerelease && <Badge muted>Prerelease</Badge>}</>
              : <span className={styles.small}>No release marker</span>}</td></tr>;
        })}</tbody></table>
      </div></div> : <div className={styles.grid}>
        {matchingProjects.slice(start, start + perPage).map(project => {
          const repos = relatedRepositories(project, repositories);
          const org = catalog.registry.organizations.find(item => item.id === project.organizationId);
          const allArchived = repos.length > 0 && repos.every(repo => repo.archived);
          return <article className={styles.card} key={project.id}>
            <div className={styles.cardTop}><Mark project={project} /><div><h2>{project.name}</h2>
              <p>{org?.name || "Independent project"}</p></div></div>
            <p className={styles.description}>{project.description}</p>
            <div className={styles.badges}><Badge>{project.category}</Badge>
              {isGrantFunded(project) && <Badge>Grant history</Badge>}
              {allArchived && <Badge muted>Archived</Badge>}
              {project.tags.slice(0, 2).map(tag => <Badge key={tag} muted>{tag}</Badge>)}</div>
            <div className={styles.cardBottom}><span>{repos.length ? repos.length + " GitHub " + (repos.length === 1 ? "repo" : "repos") : "Public sources"}</span>
              <button onClick={() => setSelection({ kind: "project", value: project })}>Explore →</button></div>
          </article>;
        })}
      </div>}

    {pages > 1 && <nav className={styles.pagination} aria-label="Results pagination">
      <button disabled={visiblePage <= 1} onClick={() => setPage(visiblePage - 1)}>← Previous</button>
      <span>{visiblePage} / {pages}</span>
      <button disabled={visiblePage >= pages} onClick={() => setPage(visiblePage + 1)}>Next →</button></nav>}

    {!isDevelopment && <details className={styles.methodology}>
      <summary>Organizations & funding history</summary>
      <p>Funding models change over time. Explore the source-backed record for each team.</p>
      <div className={styles.organizationGrid}>{coreOrganizations.map(org =>
        <article key={org.id} className={styles.organizationCard}><h3>{org.name}</h3>
          <p>{org.funding.label}</p>
          <button onClick={() => setSelection({ kind: "organization", value: org })}>History & sources →</button>
        </article>)}</div>
    </details>}
    <details className={styles.methodology}>
      <summary>Coverage, sources & methodology</summary>
      <p>Complete public repository inventories are shown below. Other maintainers are represented by selected Zcash-related repositories.
        This is a bounded source inventory, not a claim that every private, deleted or undiscovered repository is included.</p>
      <div className={styles.tableScroll}><table className={styles.coverageTable}>
        <thead><tr><th scope="col">Account</th><th scope="col">Public repos</th><th scope="col">Pages</th><th scope="col">Collected</th></tr></thead>
        <tbody>{catalog.snapshot.owners.map(owner => <tr key={owner.login}>
          <td><External url={owner.identitySource}>{owner.login} ↗</External></td>
          <td>{num(owner.repositoryCount)}{!owner.complete ? " · incomplete" : ""}</td>
          <td>{owner.pages}</td><td>{displayDate(owner.collectedAt)}</td>
        </tr>)}</tbody></table></div>
      <p>Repository identity is deduplicated by GitHub ID after redirects. Archived projects and forks remain searchable.
        Purpose tags distinguish reviewed project mappings from inferences based on repository metadata.</p>
      <p>Activity counts use 7, 30 and 90-day windows ending at collection time.
        Headline totals exclude forks. Individual commit counts are not deduplicated across separate original repositories or attribution of individual developer effort.
        Missing measurements appear as a dash. Release records include prereleases and do not establish deployment.</p>
      <p>{num(catalog.registry.grantReview.classification.length)} of {num(catalog.registry.grantReview.totalApproved)} approved proposal rows classified.
        {" "}{num(catalog.registry.grantReview.unresolved.length)} funding or repository associations remain explicitly unresolved.
        Renewals are funding events rather than additional apps.</p>
      <p>Mapped entries include both project families and their individual components; these counts are not counts of separate businesses or wallets.
        Shared upstream repositories can be associated with a scoped contribution grant without being funded in their entirety.</p>
      {catalog.registry.grantReview.unresolved.length > 0 && <details><summary>Unresolved source associations</summary>
        {catalog.registry.grantReview.unresolved.map((item, index) => <p key={item.sourceUrl + index}>
          <External url={item.sourceUrl}>{item.title} ↗</External> — {item.reason}</p>)}</details>}
      {catalog.snapshot.problems.length > 0 && <details><summary>Collection warnings · {catalog.snapshot.problems.length}</summary>
        {catalog.snapshot.problems.map((problem, index) => <p key={problem.scope + index}>{problem.scope}: {problem.message}</p>)}</details>}
      <p><Link href="/zcg/proposals">Proposal history →</Link> · <Link href="/zcg/grants">Grant ledger →</Link> ·
        {" "}<a href="/api/ecosystem" target="_blank" rel="noopener noreferrer">Public dataset ↗</a></p>
    </details>
    <footer className={styles.footer}><span>Source-linked public data. Historical funding stays visible.</span>
      <span>Checked {displayDate(catalog.snapshot.collectedAt)} · <Link href={isDevelopment ? "/ecosystem" : "/development"}>
        {isDevelopment ? "Explore projects" : "Follow development"} →</Link></span></footer>
    <DetailDialog selection={selection} close={() => setSelection(null)} repositories={repositories}
      organizations={catalog.registry.organizations} projects={catalog.registry.projects} />
  </div>;
}
