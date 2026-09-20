# OpenZcash redesign environment

This is an independent test deployment of the production application, with real
routes, server rendering, database queries and existing administrator actions.

- URL: https://zbo-redesign.up.railway.app/design-review
- Branch: `michae2xl/redesign-staging`
- Production baseline: `2ea7f6b1d8f3d2b73edaeca719a82431d1e0fbb4`
- Confirmed production deployment: `a66d7ba2-f4ad-474b-ba61-c01c8061c821`
- Railway project: `zcash-back-office` (`5476eada-862a-47bd-9166-49be9933d33c`)
- Railway environment: `redesign` (`c28d22c7-0df0-47c5-92e5-361df867ee42`)
- Application service: `zbo`; database service: `postgres-db`.
- Database: `openzcash_redesign`, on this environment's own private network and volume.

## Data and access

The 17 ZCG/ZecHub accounting and publication tables were copied from production.
`data-parity.json` records counts and canonical row digests from both databases.
All 5,567 rows, including 1,012 ledger records, matched at the recorded time.
Amounts retain their original integer cents/zatoshis, identifiers, dates, source
references and administrative corrections. The committee's source-linked roles
and relationship data remain unchanged.

Private viewing keys, invitations, scanner handles, payroll and private chain
records were not copied. Management pages initially have empty private datasets.
The official transparent ZCG address had no stored treasury/chain rows in the
production database at the time of copying, so no public reconciliation records
were omitted from those private-data tables.

Database, session, administrator, cron and onboarding credentials were generated
specifically for this environment. Production credentials are not accepted.
The administrator password is available only in Railway → redesign → zbo →
Variables → ADMIN_PASSWORD. Do not copy it into documentation, commits or chat.

`DISABLE_AUTO_REFRESH=true` pauses the automatic spreadsheet refresh, the
ZecHub treasury mirror, the GitHub-decided verdict publication and the cron
endpoint, so the accounting snapshot can be compared. The diligence signals for
under-review proposals (an in-memory cache built from public GitHub and forum
data) still warm at boot and every 6 hours, so the Diligence column renders in
either mode. Live external prices, chain heights, feeds and proposal signals
retain their existing read behavior and may change; this is not a frozen image
of the entire internet. Any writes or manual imports affect only the test
database. This environment has its own infrastructure usage while it remains
running.

Since 19 September 2026 the variable is set to `false` in the `redesign`
environment: the parity comparison had been recorded, and the review now
follows the live spreadsheet, exactly as production does. Set it back to `true`
only for a new row-by-row comparison.

## Design scope

The interior pages now use the approved prototype compositions with the real
application data and actions: a single navigation header and searchable app
directory, funding summaries, status tabs, filter toolbars, paginated/exportable
tables, record-detail layouts with source/context sidebars, editorial organization
pages, wallet/community catalogues and a focused administration workspace.
Existing route contracts, detail parameters, forms, calculations, source links
and committee public-role tags remain available. `route-coverage.json` enumerates
every native page template and its treatment.

Grant and recipient records connect their payment history, milestone progress,
original source rows and related records. Future payment totals, monthly and
category summaries all use the existing schedule population. The grant list also
accepts status, category, program and text query parameters. CSV exports include
all filtered records across pages, preserve displayed units/precision, and treat
source labels as spreadsheet text. Wallet search covers the original 18 complete
records; communities retain all channel/funding/activity fields. The 112-project
and 555-repository catalogues retain their source-backed detail dialogs.

The home page now lives inside the shell (treasury cards, then the app
launcher), and both treasuries are pinned to the bottom of every shell page.
Monthly routes, publications and generators are unchanged. The 3D room,
canvas, proposal dialog and assets are unchanged; an entrance screen now mounts
the original room after the user presses Enter.

Scheduled payments use grant-ledger entries that are unpaid, not test/internal,
have a real estimate date today or later in Brasília time, and a positive known
amount. Eligibility is decided by exclusion, like the grants summary: a
milestone is dropped only when its own row, or any row of the same grant,
carries an ending verdict (cancelled, keyholder veto, funds returned, rejected,
withdrawn). The spreadsheet's status column is free-form, so an empty or
unfamiliar status never silently removes a payment. The table, category
subtotals, month subtotals and total share one population. Undated, overdue and
unknown-amount entries are explicitly counted separately, and the grant-sheet
rows behind the schedule are cached like every other ledger read.

## Deployment and migration boundary

This branch's Railway start command runs `scripts/assert-redesign.mjs` before
migrations. When `OPENZCASH_ENV=redesign` it verifies the exact redesign
environment ID and the isolated database and refuses to start otherwise. In any
other environment (production included) the check is skipped, so the branch can
be deployed to production without editing the start command once approved; the
preview bar, `noindex` metadata and response headers are likewise only active
under `OPENZCASH_ENV=redesign`.

Railway's `redesign` environment is connected to `Michae2xl/openzcash`, branch
`michae2xl/redesign-staging`. Pushes to this branch publish this test environment.
The first successful GitHub deployment was `a856f3e0-a748-4572-b92e-18abea147705`.
Production remains connected to its existing deployment configuration.

For a manual CLI deployment, use explicit environment and service identifiers:

```sh
railway up --project 5476eada-862a-47bd-9166-49be9933d33c \
  --environment c28d22c7-0df0-47c5-92e5-361df867ee42 \
  --service zbo --detach --message "redesign: <commit>"
```

There is no automatic merge or migration to production. Review the pages and
data first. A later production migration keeps the production configuration
(no `OPENZCASH_ENV`, no `DISABLE_AUTO_REFRESH`) and deploys the reviewed
changes; `/design-review` remains reachable by URL but is only linked from the
shell in the preview environment. No DNS or production-domain changes are part
of this preview.

## Validation

- TypeScript and production build passed.
- 337 unit tests passed; 8 pre-existing integration tests skipped.
- Full ESLint: zero errors; existing unused-variable/local-image warnings remain.
- 254 protected files checked byte-for-byte against production, with no changes.
- Full public-table row comparison passed; see `data-parity.json`.
- 45 route checks passed, including real grant/recipient/Monthly detail URLs,
  the preserved `/monthly-preview` → `/monthly` and `/zcg/maya` → `/defi`
  redirects, and anonymous administrator-page redirects to login. Communities
  and Wallets had transient transport errors on the first pass and passed the
  targeted recheck without code changes.
- The separate administrator login and all three management pages passed.
- Public API comparisons matched production exactly: 192 grants, 114 recipients
  and all 1,012 disbursements. The 17 public tables were restored to the original
  verified snapshot after fixing the startup scheduler; all 5,567 rows matched
  the stored row digests again.
- Browser checks covered category filtering, the grant-detail drilldown,
  source-linked committee tags, office entrance and the rendered 3D room, and
  returning to the original home layout. The unchanged 3D asset preloader logs
  a WebAssembly CSP warning; the room still renders. No CSP or room changes
  were introduced.
- The production deployment and its existing upload-based source configuration
  remained unchanged. The redesign response headers disable indexing.

### Composition revision — 17 September 2026

The previous deployment supplied shared styling; this revision applies the actual
page compositions throughout the native application. Local browser checks covered
grant filtering/drilldown, source sidebars, wallet filtering, the app directory,
committee tags, the ecosystem catalogue and mobile layouts. Local PostgreSQL is
older than the production snapshot and lacks `zcg_publications`, so proposal/FPF/
office rendering must be checked on Railway, whose independent snapshot includes
that table. The local database was used in read-only mode and was not migrated.
The protected home, Monthly templates/assets and original 3D room remain unchanged.
No API, database schema or accounting repository changed in this composition revision.

### Parity revision — 19 September 2026

A page-by-page comparison of the live production site against this environment
(visible text, table headers, row counts and the explanatory copy of every ZCG
route) found information that the compositions had dropped, plus a few
correctness issues in the new code. This revision restores parity and fixes them.

Restored from production:

- The methodological subtitles that say where each figure comes from: `/zcg`
  (official spreadsheet, on-chain cross-reference), `/zcg/grants` (a grant
  aggregates its milestones), `/zcg/disbursements` (each row's budgeted USD,
  disbursed ZEC and the day's rate), `/zcg/totals` (settled payments only),
  `/zcg/analytics` (no new data), `/zcg/recipients` and the recipient detail
  (ranking excludes internal costs).
- The office entrance now states the rule that status changes appear the next
  day (Brasília time), as the room's own caption does.
- The ZecHub Copilot promotion keeps the two vote tests (67% of yes+no, 40%
  turnout) in its copy; the grant detail links back to the grants list; the ZCG
  overview links to `/zcg/committee` and describes the office; the News empty
  state distinguishes unreachable sources from empty filters.
- "Back" follows the production trail again: a grant returns to Grants, a
  recipient to Recipients, any other ZCG page to `/zcg`, the ZecHub copilot to
  `/zechub`, and every top-level app to Apps. The control carries an accessible
  label naming its destination.
- Internal links use `→`; only links that leave OpenZcash use `↗` and open in a
  new tab. The administrator sign-in link is no longer offered to anonymous
  visitors, matching production; the "Manage" trail and directory group are
  hidden from anonymous visitors, including on the public `/onboarding` route.

Correctness fixes in the new code:

- `/zcg/disbursements` KPI tiles summed only the 400 most recent rows of the
  selection. They now come from a whole-population aggregate over the same
  filters (`summarizeDisbursements`), and the footer states how many of the
  selected records the list shows.
- Scheduled payments no longer require the row status to be one of three
  literals; see "Design scope" above for the exclusion rule.
- `getPaymentSchedule()` is cached and no longer a hard dependency of `/zcg`
  or `/zcg/grants` (a failure hides the schedule figure instead of the page).
- CSV export keeps negative amounts (clawbacks) as numbers instead of
  apostrophe-prefixed text, exports the displayed cell text, skips the
  administrator "Manage" column and names the file after the table.
- Tables offer 25/50/100 rows or "All" per page, restoring in-page search over a
  whole ledger. `mobileHidden` columns are hidden again below the `sm`
  breakpoint (the `ws-optional-column` class had no CSS rule).
- The proposals and FPF tables no longer generate a second, client-only verdict
  filter that disagreed with the published `?status=` funnel; selecting the
  active verdict in the funnel clears it, without scrolling to the top.
- The sticky header only offsets for the preview bar when that bar is rendered.
- The diligence signals warm even when automatic refresh is paused.
- The startup guard is conditional on `OPENZCASH_ENV=redesign` (see above).

Not changed on purpose: the treasury cards removed from `/zcg` in the previous
revision stay on the home launcher; the stipends page keeps its card layout.

### Visual system revision — 20 September 2026

The warm amber/beige skin was replaced by the approved direction (Mercury as
the reference; mockups at https://claude.ai/artifact/Q8VGqjxTubVq1BaJCNbvZY):

- `src/app/theme.css` holds the tokens (light and dark), the shell layout and a
  remap of the Tailwind colour utilities the pages already use, so no page
  changed its markup or lost data. `redesign.css` and `workspace.css` were
  re-skinned mechanically: every warm hex colour now reads a token.
- New shell: dark sidebar with the official Zcash mark, grouped navigation
  (open groups remembered per browser), top bar with the back control, the
  trail, record search (⌘K / Ctrl+K), an "Ask Copilot" action and a theme
  toggle (system → light → dark, remembered per browser). The dark theme is
  near-black with a light gold-to-black gradient, the house identity.
- The two treasuries (ZCG operating and the Lockbox / Coinholder pool) are
  pinned to the bottom of every shell page, streamed from one cached
  projection (`lib/zcash/treasury-summary.ts`) that the home cards use too.
- The home page (`/`) now lives inside the shell: treasury cards, then the app
  launcher with its reorder/hide behaviour. Monthly and the 3D room are the
  only pages that keep their previous chrome; the scope guard and
  `route-coverage.json` reflect that.
- Font: Geist for the workspace (Arcadia, the reference's face, is
  proprietary); Inter remains for Monthly.

### Coinholder split — 20 September 2026

- `/zcg/coinholder` is the retroactive round only: proposals, requested
  total, review and poll dates, size bands, the proposals table and the
  ballot note. `/zcg/coinholder/pool` is the money: live ZIP-1016 balance,
  value, paid to date, receivables and the funding history tables.
- The "two pools" switchers on this page and on ZCG totals are gone; the
  foot links connect round, pool, FPF records, Lockbox and ZCG totals. The
  FPF app lists Coinholder Grants, Coinholder pool and Coinholder Copilot.

### No side columns — 20 September 2026

- `RecordLayout` no longer draws a right column: the aside (facts, connected
  records, program resources) becomes a compact foot under the content, a
  flat grid with hairlines and small-caps titles. Every page that used the
  layout is full width now; nothing in the asides was dropped.
- News is a dense back-office list: source tabs with counts (the former
  "Follow a source"), one search, a meta line (the former "This week"), and
  rows of mark · title · kind · source · date. Marks are PNG: the brand
  glyphs for GitHub and Google Sheets come from `simple-icons`.

### Office entrance and overview tools — 20 September 2026

- The ZCG office entrance is a quiet card on the theme (surface, hairline,
  ink and muted text, gold button) instead of the black-and-green hero. The
  door is a PNG illustration (`public/illustrations/zcg-door.png`, drawn in
  `scripts/gen-illustrations.mjs`): a gold arch, the door ajar, and a zebra
  peeking out and looking at you. Gold, ink and white only, so it sits on
  both themes.
- The ZCG overview no longer hides "More ZCG tools" in a details block at
  the foot: the tools sit under the scheduled-payments card, filling the
  left column beside the week's changes. Tiles use the page glyph PNGs.

### Copilots, Lockbox and committee — 20 September 2026

- The three copilot pages (ZCG, Coinholder, ZecHub) share one quiet layout
  (`components/copilot/copilot-page.tsx`): intro, install command with a
  copy button, agent chips, the demo transcript, the questions it answers
  and the sources it reads. No display headline, no cards, no shadows.
- The transcripts keep their animation but use the palette: ink text, gold
  figures, verdicts in the pos/neg/accent tokens, no terminal chrome.
- Agent marks are brand glyphs from `simple-icons` rasterised in ink
  (`public/logos/agents/`, inverted in the dark theme); Codex has no
  published mark and keeps a plain glyph.
- Lockbox is hidden from the sidebar and ⌘K (`hidden` on the app); it opens
  from the Lockbox pool in the treasury bar. Stipends and Budget are hidden
  pages for the same reason: the committee page already carries both.
- The committee page drops its editorial block and connected-records panel.
- The Zcash Foundation mark is its GitHub avatar (legible on both themes);
  the generated emblem is no longer used.

### Monthly palette — 20 September 2026

- The Monthly reader keeps its structure (own header, edition library, PDF
  pages, sources panel) but its two CSS modules now use the production
  palette: paper → cream, the sage greys → stone, the old gold → the accent
  gold, whites → surface. Mapped by lightness and hue, no layout change.
- Its brand marks are the PNG mark. Routes, data and published editions stay
  frozen; `scripts/redesign-scope-check.sh` no longer guards the components.

### Marks and order — 20 September 2026

- App marks sit bare on the sidebar, no white tile in either theme; the
  generated ink glyphs invert to light in the dark theme.
- Order: Monthly and News on top, then ZCG (open), Lockbox, FPF, the
  organisations (Zcash Foundation, ZODL, Shielded Labs, Zakura, Tachyon,
  ZecHub DAO), then Z3, Ecosystem, Wallets, Communities, DeFi, Arborist
  Calls, Manage. "ZF" reads "Zcash Foundation".
- Tachyon joins with its GitHub organisation avatar (see
  `docs/ecosystem-branding.md`), opening `/ecosystem?org=project-tachyon`.

### Detox — 20 September 2026

- The home is the ZCG overview: `/` redirects to `/zcg`, the banner links
  there, the "Home" item is gone. The former home (treasuries and launcher)
  was removed altogether: the treasuries live in the bottom bar, each pool
  linking to its page, and the sidebar and ⌘K are the app directory.
- The stat strip is one shared component everywhere: the ZCG overview
  dropped its flush-left variant (the first figure touched the box edge)
  and every figure is centred in its cell.
- The breadcrumb reads "App › Page › Detail"; the back control goes detail →
  list, page → app, app → ZCG. The sibling-page trail and the page footer
  are gone; the sidebar is the index.
- The hamburger only shows in the mobile drawer. The treasury bar sits on
  the banner's gold band (`--band`), each pool with its name above and the
  figures on one baseline, meta and link stacked on the right.
- Grants no longer carries the scheduled-payments block nor the committee
  promo. Scheduled drops the category card and the aside: the table spans
  the column and the months are a strip of filters. ZF drops its links
  aside for the same reason.
- The ZCG overview's two cards keep their own heights (no stretched empty
  card).

### Sidebar revision — 20 September 2026

- The banner is centred: the official mark at 68px over the gold band, the
  name below, no environment tag and no tagline. The band follows the theme
  (cream and gold in light, black and gold in dark).
- The sidebar follows the theme: cream panel in light, near-black in dark,
  through the `--side-*` tokens. No lines anywhere: no right border, no
  guide line on nested pages, no footer separator, no scrollbar track.
- Every app mark sits on the same white rounded tile, the treatment the ZF
  logo already had. Generated marks are now ink glyphs on transparent; ZF
  shows its padlock-shield emblem alone (the wordmark was unreadable).
- ZODL (Zcash Open Development Lab) joins the menu and the launcher after
  Zakura, with its ecosystem logo, opening `/ecosystem?org=zodl`; the
  explorer now accepts `?org=` and selects that organisation's record.
- The `/zcg/schedule` menu label is "Scheduled" so it never truncates.

### Clean system — 20 September 2026

- Every mark is a PNG: official logos where they exist, otherwise badges
  and glyphs generated by `scripts/gen-app-icons.mjs` from the line icons
  (`public/logos/marks/`, `public/logos/glyphs/`). The sidebar keeps only the
  expand chevrons and the close button as vectors.
- The sidebar head is a Discord-style banner (`.rd-side-banner`): dark
  gradient with the gold glow, the official round icon, the product name and
  the environment tag.
- ZCG is the first app and opens by default; the leading apps (Monthly, News,
  Lockbox) no longer head the list. Order: ZCG, Lockbox, ZF, FPF, Shielded
  Labs, ZecHub DAO, Z3, Zakura, Ecosystem, Wallets, Communities, DeFi,
  Arborist Calls, News, Monthly, Manage (admin).
- Zero horizontal scrolling at any width: the body clips overflow, tables
  fill the content column and wrap cell text, the record layout collapses
  under 1100px, the treasury bar wraps. Checked at 375, 1024 and 1440px on
  the grants list, the grant detail and the disbursements ledger.
- Table header controls (sort, CSV per column) show on hover or when the
  column is sorted; the browser chrome colour follows the cream canvas.

### Hierarchy and palette — 20 September 2026

- The workspace returns to the production palette (cream, stone, gold) in
  `theme.css`; the dark theme keeps the black-and-gold identity behind the
  toggle.
- Navigation follows the production app hierarchy (`lib/design-routes.ts`):
  one sidebar entry per app in launcher order, official logos where they
  exist (ZCG, ZF, FPF, Zakura, Shielded Labs, ZecHub DAO, Arborist Calls,
  Communities), inner pages nested and expandable, and Zakura (the Valar
  Group / Project Tachyon full node) added to the menu and the launcher,
  opening its ecosystem record. (Order revised the same day: ZCG first, see
  "Clean system" below.)
- Every page's trail derives from that model: breadcrumb Home › App › Page ›
  Detail, back control to the parent, sibling pages at the foot of the page.

### Canvas alignment — 20 September 2026

After review on a dark-mode system: the light workspace is now the default
everywhere (dark only through the toggle, remembered per browser); sidebar
items carry a line icon and their record count from `/api/nav-counts`
(cached five minutes, read after the page paints, every source optional);
editorial intros, feature links, treasury heroes and quick links are flat
surfaces with hairlines; the home launcher lists apps as compact rows and
keeps reorder, hide and the unread News badge.

### Composition revision — 20 September 2026 (approved canvas)

The three screens the canvas defined now follow it: the ZCG overview (two
columns with the scheduled payments and the week's changes, primary records
with live counts, compact committee row, live-vote banner), the proposals
list (verdict funnel as text tabs, selection strip with median days in
review, requested total and rows past the average turnaround) and the grant
detail (meta pills, progress in the summary strip, one milestone timeline).
The full committee cards and the election history remain on `/zcg/committee`.

### Governance revision — 20 September 2026

Closes the open items of the organisational trail (`docs/redesign/README.md`,
§4):

- `/zcg/committee` now answers "who decides, for how long, and paid how":
  seats and source-linked roles, terms by cohort, election history, stipend
  totals per member (former members marked), the last five meeting minutes,
  the discretionary budget cards and the ZCAP voter count with a link to `/zf`.
  Each block degrades on its own if its source is unreachable.
- One source for the committee: the 3D office derives its seats from
  `officeMembers()` in `current-committee-data.ts`; the seat caption is the
  member's leading source-linked fact. The unsourced office tags are gone.
- Stipend aggregation moved to `lib/zcg/stipends-summary.ts` (pure, tested)
  and `lib/zcg/stipends.ts` (cached ledger read), shared by both pages.
- Status labels come from `lib/zcg/status-labels.ts` everywhere (grant status,
  ZCG verdicts, coinholder verdicts); the six local maps are gone. Grant
  status wording is now uniform ("Keyholder veto", "Funds returned").
- The last inline `‹` links (office, stipends, disbursement banners) are gone;
  the shell's back control is the only "back".
- `docs/redesign/README.md` replaces the 8 September plan with the boundary
  actually adopted (launcher, Monthly and the 3D room preserved; everything
  else in scope) and `scripts/redesign-scope-check.sh` guards that set.
