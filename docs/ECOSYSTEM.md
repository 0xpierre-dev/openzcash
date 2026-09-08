# Ecosystem and development catalog

`/ecosystem` is a source-linked directory of Zcash projects and components.
`/development` exposes the underlying public repositories with maintainer,
purpose, funding-history, archive and fork filters, plus 7/30/90-day activity.
Both apps are available from the existing app launcher. `/api/ecosystem` serves
the same public dataset.

## Data boundaries

- `src/data/ecosystem/registry.json`: reviewed project identities, organizations,
  public accounts, purpose tags, dated funding evidence and proposal review.
- `src/data/ecosystem/snapshot.json`: public GitHub metadata and measured
  activity, with collection timestamps, source URLs and the registry SHA-256.
- `scripts/sync-ecosystem.mjs`: read-only, repeatable GitHub collection using the
  existing `gh` authentication. No discovered repository is cloned or executed.

The app renders a dated snapshot, not an automatically refreshing live feed.
Page requests do not run collectors, read GitHub credentials, or write to the
grant accounting database. A registry/snapshot hash mismatch fails validation
instead of publishing a mixture of different inventories.

## Coverage

The registry distinguishes complete public-account inventories (`scope: all`)
from selected, source-associated repositories belonging to individuals and
multi-chain organizations. Full inventories include archived repositories and
forks, and paginate until the API returns a short page, including the empty
trailing page for exact multiples of 100. GitHub User accounts and Organization
accounts use their respective endpoints. All results must be explicitly public.

Repository transfers are resolved through GitHub and deduplicated by stable
node ID, retaining old names as aliases. Complete account coverage does not mean
every repository in an account is an actively supported Zcash application.
Private, deleted and undiscovered repositories are not included. Code hosted
outside GitHub is linked as a public project source without invented GitHub
activity or repository counts.

Projects and components are separate from repository identities. A family and
its component may both have directory entries; renewals are funding events, not
new applications. Reviewed project mappings provide purpose tags; remaining
repositories receive explicitly labeled inferred tags from names, descriptions
and topics. These classifications are not code audits or endorsements.

## Funding provenance

Organization financing, repository namespace, project maintainership and
project-specific grants are separate relationships. The grant filter requires
an explicit positive decision on a source-associated project or contribution.
It must not infer that every repository owned by a grantee was grant-funded.
For shared upstream projects, grants cover the cited contribution scope, not
the entire library or every maintainer.

The reviewed proposal universe contains 179 approved rows: 84 software, 6
research, 42 education, 23 service and 24 non-app proposals. This is a dated
review of the official proposal ledger, not a claim that 179 applications were
built. Renewals are consolidated, and unresolved repository associations,
conflicting decisions and unverified closeout states remain visible.

An approval is not proof of payment, milestone acceptance, delivery, deployment
or continuing support. Events retain their specific proposal and repository
evidence. When a ledger date precedes the original proposal discussion, the
decision date remains unknown; the original recorded value and discrepancy are
preserved rather than silently assigning a false chronology.

Examples of organization-level distinctions:

- Zcash Foundation and Bootstrap/ECC received direct Development Fund
  allocations under [ZIP 1014](https://zips.z.cash/zip-1014). Their direct
  allocations ended with the November 2024
  [ZIP 1015 transition](https://zips.z.cash/zip-1015). This does not establish
  that all other financing or operations ceased.
- ZF's [May 2026 stewardship announcement](https://zfnd.org/zcash-foundation-assumes-stewardship-of-core-zcash-community-assets/)
  distinguishes administration of the `zcash` namespace from collaborative
  maintenance across teams.
- [ZODL's seed financing](https://zodl.com/zodl-raises-25m-in-seed-funding/),
  [Zakura's donation-funded teams](https://zakura.com/announcements/introducing-zakura/)
  and [Shielded Labs' independent funding disclosure](https://shieldedlabs.net/)
  are not recorded as ZCG project awards.

## Activity definitions

Commit totals come from GitHub's current default-branch history, bounded by a
common collection cutoff and 7/30/90-day start times. They measure reachable
commit records, not contributor effort, code quality or delivered features.
Commits shared between separate original repositories are not deduplicated.
Shared and multichain repositories may include non-Zcash work; their counts are
repository-wide, not isolated measurements of Zcash-specific development.

Forks remain visible, with individual counts, but are excluded from headline
activity totals to avoid duplicating upstream history. A missing measurement
is `null` and displays as a dash, not zero; coverage is reported separately.

Release collection follows every page and filters by publication time rather
than stopping at an old creation date. Published records include prereleases
and can contain repository notices. A release marker is not proof of a stable
package or production deployment. Push time and release publication time are
different measurements.

Sources: [GitHub repository REST API](https://docs.github.com/en/rest/repos/repos)
and [GitHub GraphQL commit history](https://docs.github.com/en/graphql/reference/commits#commit).

## Refresh and verify

With GitHub CLI already authenticated for public read access:

```sh
npm run sync-ecosystem
npm run test:ecosystem-sync
npm test
npm run typecheck
npm run lint
npm run build
```

The normal sync refreshes every inventory and activity measurement. The optional
`npm run sync-ecosystem -- --cached` resumes a local research collection using
its existing cutoff and cached source reads; it is not a freshness check.
The cache is ignored by Git and must never contain tokens or private metadata.

A failed or incomplete full-account scan cannot replace the prior snapshot.
Selected-repository or activity failures are recorded as scoped warnings.
Review warnings, registry changes, identity transfers, proposal decisions and
funding evidence before publishing. The GitHub sync does not automatically
reclassify new grant proposals or validate new funding associations.

Tests cover pagination boundaries, release ordering, fail-closed snapshots,
alias matching, filters, historical grants, missing activity, fork exclusion,
source URL safety and registry/snapshot consistency.

X/Social Radar ingestion and its API are outside this implementation.
