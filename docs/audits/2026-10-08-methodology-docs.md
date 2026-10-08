# Methodology documentation audit — 2026-10-08

The `/zcg/methodology` page ("How we compute this") is the site's source-of-truth
page for figures, and the wording other surfaces (agent skill, Zarvis knowledge
index, per-page source notes) repeat. This pass fact-checked every claim on the
page against the implementing code, tightened the prose into five named rules
other pages can cite by anchor, and fixed four claims that did not match the
code. No figure, total, or data pipeline was changed; no new numbers were
introduced beyond cache cadences already encoded in the code.

## Scope and method

Every factual claim in `src/app/zcg/methodology/page.tsx` was traced to its
implementation: collection scheduling (`src/instrumentation.ts`,
`src/lib/zcg/refresh.ts`), the GitHub application importer
(`src/lib/zcg/github-applications.ts`), the forum importer
(`src/lib/zcg/import-meetings.ts`), the Lockbox computation
(`src/lib/zcash/lockbox-live.ts`, `src/lib/zcash/lockbox.ts`), the price oracle
(`src/lib/pricing/live-price.ts`), the API surface (`src/app/api/zcg/**`,
`src/lib/api/serialize.ts`), and the freshness stamp (`src/components/synced.tsx`).
Downstream copies were audited for drift: `skills/zcg-copilot/SKILL.md`,
`src/lib/zarvis/public-content.json` (generated), and the pages that restate
methodology rules in fine print.

## Implemented corrections

| Claim on the page | Was | Now / reason |
| --- | --- | --- |
| GitHub application labels | "open issues labelled 'Grant Application / Ready For Review'" — not a real label pair | Applications carry the "Grant Application" label; "Ready For ZCG Review" marks the review queue; unlabelled re-applications are recognised by title and open applications without a decision label count as awaiting review (`src/lib/zcg/github-applications.ts:60-80`) |
| Lockbox / ZIP-1016 balance | Implied a pure chain read from lightwalletd | Disclosed as hybrid: latest spreadsheet Lockbox snapshot plus protocol-deterministic accrual of 0.1875 ZEC per block (ZIP-1015) to the live chain tip; lightwalletd supplies the tip read-only, no viewing-key scans run (`src/lib/zcash/lockbox-live.ts:44-67`, `src/lib/zcash/lockbox.ts:13-19`) |
| CSV availability | "See /api/zcg (JSON, or CSV via ?format=csv)" — the index endpoint is JSON-only | `/api/zcg` is a read-only JSON index; CSV via `?format=csv` exists on the `/api/zcg/data/` endpoints (`src/app/api/zcg/route.ts:4-20`, `src/lib/api/serialize.ts:26-61`) |
| Stale code comment | `src/lib/zcg/import-meetings.ts` doc comment said forum minutes import "as part of the daily refresh" | Comment corrected to the six-hour cycle (`src/lib/zcg/refresh.ts:59`, `src/instrumentation.ts:41`); no behavior change |

## Structure: five named rules

The page now carries stable anchors (`#sources`, `#precedence`, `#refresh`,
`#classifications`, `#discretionary`, `#usd-vs-zec`, `#payment-not-delivery`,
`#reconciliation`, `#limits`, `#api`, `#corrections`) and five rules a reader or
agent can cite directly:

1. **Rule 1 · Source precedence** — spreadsheet wins for grant payments and,
   once publication-eligible, for verdicts; a fresher GitHub decision shows
   until then (`docs/zcg-publication.md:16-21`,
   `src/app/zcg/proposals/page.tsx:406-420`); third-party grant lists (pgpz)
   are supplementary, never substituted (`skills/zcg-copilot/SKILL.md:44-48`).
2. **Rule 2 · Refresh is retrieval, not source edit** — cadence table:
   spreadsheet 6h (marker stamped even when unchanged,
   `src/lib/zcg/refresh.ts:13-30`), GitHub cache ~15 min
   (`github-applications.ts:19`), price cache ~10 min with provider quote time
   (`src/lib/pricing/live-price.ts:17,31-38`), chain tip ~60 s
   (`src/lib/zcash/lockbox-live.ts:17`), forum minutes best-effort inside the
   6h cycle.
3. **Rule 3 · USD vs ZEC** — budgeted USD / USD paid (budgeted value of paid
   entries) / ZEC paid (recorded quantity) must not be added; historical ZEC is
   never revalued at today's price. Matches the API index notes
   (`src/app/api/zcg/route.ts:19`) and the copilot skill field rules.
4. **Rule 4 · Payment ≠ delivery** — approval is not payment; a recorded
   payment is not proof of delivery or impact; unpaid is not necessarily an
   open commitment; cancelled grants stay inside some budgeted totals.
5. **Rule 5 · Reconciliation limits** — aggregate transparent flow only;
   per-payment auditing would require the ZCG shielded viewing key, which
   OpenZcash does not hold or use; links `/zcg/reconciliation` instead of
   duplicating it.

New sections: "What this page does not claim" (limits box) and "Corrections"
(GitHub issue tracker; routine source changes surface via the automated
per-refresh changelog on the overview page and `/api/feeds/zcg.xml`,
`src/lib/zcg/changelog.ts:9-15`).

## Cross-links and downstream copies

- `src/app/zcg/budget/page.tsx` gained a `SourceNote` (the page's
  two-discretionary-figures section describes exactly this page's numbers).
- `src/app/communities/page.tsx`: "see the methodology" is now a hyperlink
  (was plain text).
- `src/app/zcg/analytics/page.tsx` (payment ≠ delivery note),
  `src/app/zcg/schedule/page.tsx` (amount rules note), and
  `src/app/zcg/proposals/page.tsx` (GitHub-verdict note) now deep-link the
  relevant rule anchor.
- `skills/zcg-copilot/SKILL.md`: rules verified consistent with the page; one
  line added making the methodology page canonical for figures and statuses so
  divergence becomes a reported finding. The published mirror under
  `public/.well-known/` regenerates from `scripts/publish-copilot.mjs` on
  build; it is not tracked in git.
- `src/lib/zarvis/public-content.json` regenerated (`npm run knowledge:build`);
  it embeds the page text and previously carried the wrong label string.
- The treasury calculator was left untouched: it already carries a detailed
  per-figure "Sources & calculation" panel
  (`src/app/zcg/treasury-calculator/treasury-calculator.tsx:585-614`).

## Evidence and limits

Known residual risks, recorded deliberately: the two discretionary figures
(~$1.8M cumulative pivot; $1M annual cap, ~$1.27M spent) remain static prose on
the page and can drift from live values — a candidate for rendering from data
in a later pass. External label names and provider behavior are taken from the
code's own constants and comments, not verified against the live GitHub repo or
price APIs. An API field dictionary and any reconciliation-page copy changes
were explicitly out of scope for this pass.

## Validation

- `npm run lint` — pass, exit 0 (four pre-existing warnings in untouched
  files: `scripts/gen-app-icons.mjs`, `src/components/login-form.tsx`,
  `src/components/monthly/monthly-bundle.tsx`).
- `npm run typecheck` — pass (exit 0).
- `npm test` — pass: 3,034 vitest tests passed and 12 skipped across 218 files
  (baseline before this pass: 3,028 passed; the delta is the six new
  methodology page assertions), plus the knowledge-index and error-fallback
  suites; the three PostgreSQL integration suites skip without their
  environment variables.
- `npm run test:copilot` — pass (publisher checks + 9 Python tests).
- `npm run build` — pass.
- New colocated test `src/app/zcg/methodology/page.test.tsx` renders the page
  and pins: the corrected GitHub label strings, the Lockbox hybrid disclosure,
  the ordered headings including the five named rules, the rule anchors, the
  USD/ZEC non-additivity sentence, the CSV-on-data-endpoints wording, and the
  reconciliation link.

These checks validate the local candidate. They do not establish a production
deployment.
