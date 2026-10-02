# Project history: the OpenZcash evidence record

The product decision is to help a reader reconstruct what a project proposed,
what was decided, which payments were recorded and what work can be evidenced.
The same source-linked record serves the web profile and Zarvis. This is a
project record, not a performance rating or an allegation engine.

## First release

- `/ecosystem/history` searches every identity in the existing project and
  community catalogs. It is not a claim to cover every Zcash initiative.
- `/ecosystem/history/{id}` has a timeline, associated grants and milestones,
  source dates and explicit evidence gaps. Community report links remain visible.
- `GET /api/project-history?q=...` resolves identities. Search may return several
  candidates; no candidate is silently chosen or merged.
- `GET /api/project-history/{id}` returns the complete assembled public record.
  `?month=YYYY-MM` filters **timeline event dates in UTC only**. Grant amounts
  remain all-time; undated records are excluded and counted. This is not an
  as-of reconstruction of what was known that month.
- Zarvis's `query_project_history` uses that same reader. A narrowly phrased
  `Show project history for Zaino.` (also supported in Portuguese and Spanish)
  returns a computed overview without requiring a model. Broader analysis can
  call the tool; bounded excerpts disclose their counts and must not be summed.

Financial reads use the existing database mirror without mutations and preserve
the published proposal-status policy. No private scanner, viewing key or admin
override data is exposed. A source failure leaves amounts unavailable. Catalog
funding references can remain as explicitly dated context. Queries do not run
the importer or the repository collector.

## Identity and financial rules

1. A project uses its canonical catalog ID. Repository membership comes from
   the reviewed project mapping, not every repository under an organization.
2. Grant-title associations come from curated funding events, with an exact
   case/whitespace-normalized title and program match. Community recipient
   aliases and application topics must already be curated. Substring search
   never establishes a financial association. Multiple matching proposals block
   the amount/milestone association until identity is resolved.
3. Grant identities and payment IDs deduplicate records. Reused grants name all
   associated project identities. Amounts describe the grant, never an inferred
   component allocation; there is no cross-project grand total.
4. Requested USD, published approval **status**, ledger budget USD, budget USD
   of paid entries and recorded ZEC are different measures. The available
   proposal source has no distinct approved-amount field. An approved request
   must not be relabeled as an approved amount without further evidence.
5. Values remain decimal strings of cents/zatoshis, summed with BigInt.
   Negative returns remain negative. Unknown and absent values remain null;
   incomplete subtotals include missing-record counts. Test, internal and
   operational worksheet rows are outside this grant history.
6. Payment dates, decision dates, publication dates, import dates and snapshot
   dates are separate. Unknown event dates stay unknown. A stale catalog
   decision cannot overwrite a more recent published proposal status.

## Evidence vocabulary

| Level | Establishes | Does not establish |
| --- | --- | --- |
| Source record | A proposal, published decision or ledger entry exists | Delivery, current valuation or bank/on-chain settlement |
| Published artifact | A repository release was published | Acceptance of a funded milestone, adoption or impact |
| Team reported | A mapped team progress reference or reviewed report claim | Independent acceptance of the work |
| Reviewed delivery | A source documents delivery/acceptance of the specifically linked milestone | Overall project success or causal impact on the network |

The repository snapshot is bounded and dated; do not call it the complete or
live release history. Maintainer progress links without extracted dates remain
undated. A community without a repository is assessed from its own reports,
not assigned zero output. Missing evidence is not proof of non-delivery,
lateness, misconduct or zero funding. No unsupported impact scores are emitted.

## Persisting new learning

`src/data/project-history/evidence.json` is the versioned admission point for
reviewed, public reports and milestone evidence. It starts empty deliberately:
old approvals, payments and reviews cannot manufacture delivery sign-off.

For each new record, a reviewer must inspect the original source, record its
event date, canonical project ID, source URL, review date and a concrete review
note. `reviewed_delivery` additionally requires the exact linked milestone IDs.
A team statement stays `team_reported` unless the stronger claim is actually
supported. Do not auto-promote model summaries into reviewed facts. Never store
private discussions or credentials in this public evidence file.

Corrections append a new ID with `supersedes` pointing to the earlier entry;
they do not erase the original. The validator rejects duplicates, forward/cyclic
references, cross-project corrections and reviews dated before their event.
Paid-entry counts count distinct ledger rows, not necessarily distinct accepted
milestones. Milestone IDs are ledger content IDs; corrections to their source may require
a reviewed re-link, never a fuzzy reassignment.

To extend coverage, first resolve identity and source scope, then add adapters
or reviewed evidence. Preserve these meanings in the profile, model prompt and
monthly reporting. The monthly producer can consume the public API; this change
does not change the approved Monthly/Operations design or schedule, and does
not automatically rewrite published reports.

## Validation and remaining limits

Tests cover program/identity isolation, repeated-title ambiguity, shared awards,
   partial/failed sources, refunds, exact amounts, release deduplication,
non-inference of completion, evidence admission and correction handling,
UTC filters, and Zarvis's no-model route/tool dispatch. Verify the rendered
directory/profile on desktop and compact viewports, the three sections, source
links, month filters, empty/failure states and the Ask Zarvis handoff.

This is an assembled current record, not a complete bitemporal warehouse.
Database corrections are not reconstructed as historical states. The reviewed
evidence file supplies persistent curation; collecting full release archives,
extracting all community reports, admitting milestone acceptance evidence and
longitudinal source snapshots remain further coverage work. The interface must
keep those boundaries visible.
