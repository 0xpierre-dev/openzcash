# Z DAO: OpenZcash foundation and Zcash identity

Z DAO uses the light color and typography foundation of [OpenZcash](https://openzcash.org), with a dedicated community-governance layout, a Zcash currency mark, and Light, Dark, and System appearance modes. The light foundation was verified against the local OpenZcash source on October 8, 2026: `src/app/globals.css`, `src/app/layout.tsx`, and `src/components/app-shell.tsx`. The dark palette is a DAO adaptation; it is not presented as an official OpenZcash dark-theme specification.

The visible header identity is **Z Voice**, with no subtitle. The Zcash mark is larger than the wordmark, with Voice centered vertically alongside it: 44 px mark / 28 px type on desktop, scaling together on smaller screens. Workspace, sign-in and signup headers share these proportions. Some legacy metadata still uses Common Ground. The standalone Zcash currency mark is the original PNG, displayed through a CSS alpha mask in ink for Light and yellow for Dark. This preserves the source silhouette and file bytes while allowing sufficient foreground contrast. Asset provenance, verification, licenses, and attribution are documented in [Zcash brand assets](./zcash-brand-assets.md). Using the mark does not imply official endorsement.

## Current color tokens

The authoritative values live in `app/workspace.css`. The table below records the implementation on October 8, 2026.

| Role | Light | Dark |
| --- | --- | --- |
| Page background | `#faf8f4` | `#141412` |
| Primary surface | `#ffffff` | `#1e1f1c` |
| Secondary surface | `#f6f3ec` | `#282922` |
| Header | `#ffffff` | `#191a16` |
| Primary text | `#1c1917` | `#f5f3ed` |
| Secondary text | `#3f3a35` | `#dedfd8` |
| Muted text | `#57534e` | `#bdbeb4` |
| Decorative border | `#e9e3d6` | `#3e4036` |
| Strong decorative border | `#d8cfba` | `#56594b` |
| Form-control border | `#8f8574` | `#8b907d` |
| Gold accent | `#b7791f` | `#f4b728` |
| Accent foreground | `#92600f` | `#f2c866` |
| Soft accent surface | `#f8eedb` | `#37311f` |
| Primary action background | `#f4b728` | `#f4b728` |
| Primary action text | `#1c1917` | `#181c13` |
| Primary action hover | `#ffd05c` | `#ffd05c` |
| Treasury panel surface | `#ffffff` | `#1e1f1c` |
| Positive status text / surface | `#246443` / `#edf5ef` | `#a0dfb7` / `#203c2c` |
| Error text / surface | `#982f23` / `#fff1ed` | `#ffc1ad` / `#43271f` |

Primary actions use yellow with dark text. Gold also identifies selected navigation and smaller accents. Community counts and both treasuries share one quiet panel, with spacing between funds and a divider between summary and treasury sections. Submission buttons use the same yellow primary-action style. Status meaning remains explicit in text rather than depending on color alone.

## Light, Dark, and System behavior

The header uses one borderless sun/moon button with the accessible label **Toggle light and dark mode**. The moon switches to Dark; the sun switches to Light. A 44 px hit target and visible keyboard focus are retained on every screen size. With no saved explicit choice, the workspace still follows the device preference; the first click selects the opposite of the resolved appearance. CSS selects the appropriate icon before hydration, including for the system default.

`app/communities/layout.tsx` reads the `workspace-theme` cookie on the server and validates its value through `lib/domain/workspace-theme.ts`. Only `system`, `light`, and `dark` are accepted; missing or malformed values resolve to `system`. `WorkspaceThemeProvider` renders the initial preference into `.dao-theme-root[data-theme]`, so an explicit stored preference is present in the initial markup rather than being corrected after hydration.

System uses the light foundation by default and selects dark tokens entirely through `@media (prefers-color-scheme: dark)`. There is no JavaScript `matchMedia` lookup or client-only color decision during hydration. Operating-system or browser preference changes are handled by CSS. See [MDN: prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme).

The matching `color-scheme` declaration also informs native controls and browser-rendered interface colors. Conditional document CSS applies the active scheme only while a workspace theme root is present; JavaScript does not change global HTML attributes. See [MDN: color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme).

Selecting a preference updates the scoped React context immediately and writes this non-sensitive cookie:

```text
workspace-theme=<system|light|dark>; Path=/communities; Max-Age=31536000; SameSite=Lax
```

`Secure` is appended on HTTPS. The preference lasts up to one year, survives reloads through the server cookie read, and remains in the shared layout context while navigating between community pages. It is not an authentication or authorization value. If browser cookie storage is blocked, the current appearance still updates. Existing administration and ballot screens retain their current styling.

## Typography and assets

OpenZcash uses **Inter** for interface text and **Geist Mono** for monospaced text. The workspace self-hosts the same Latin variable font assets, normal style and weights 100–900, avoiding a runtime request to a font provider:

| Workspace asset | Source build asset | Bytes |
| --- | --- | ---: |
| `public/fonts/openzcash-inter-latin.woff2` | `.next/static/media/83afe278b6a6bb3c-s.p.2bn3s6zvc0dyp.woff2` | 48,432 |
| `public/fonts/openzcash-geist-mono-latin.woff2` | `.next/static/media/797e433ab948586e-s.p.0r6juujl39pe6.woff2` | 23,108 |

The source build's generated font-face declarations identify these files as the Latin subsets. The font files were copied without modification from the local OpenZcash checkout. System sans-serif and monospace fallbacks cover glyphs outside their coverage. The implementation uses `font-display: swap`, normal browser font smoothing, and tabular or monospaced numerals for financial values.

The reading scale uses 16 px body and form text, 17–18 px proposal titles, a compact 21 px Proposals heading, and 28 px treasury summary values. The board starts with Proposals and its creation action on one row; the redundant community banner and header selector have been removed. Detail pages retain larger headings. Inter provides the text hierarchy; Geist Mono makes amounts and community counts easier to compare. Proposals use individual cards on every screen size.

### Font licenses

Both fonts are distributed under the **SIL Open Font License 1.1**. Their original copyright notices and full license text are included alongside the assets:

- `public/fonts/Inter-OFL.txt`: Copyright 2020 The Inter Project Authors. Source: [official Google Fonts Inter license](https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt).
- `public/fonts/GeistMono-OFL.txt`: Copyright 2024 The Geist Project Authors. Source: [official Google Fonts Geist Mono license](https://raw.githubusercontent.com/google/fonts/main/ofl/geistmono/OFL.txt).

Keep these notices with the font assets when distributing or deploying the application. The font licenses are separate from the application's source-code license.

## Community navigation and accessibility

A compact desktop header puts Z DAO first, followed by Proposals, Treasury and Members, with the borderless appearance icon close to the account. Responsive layouts adapt the shared navigation at narrower widths. Proposals is the default and brand home destination; there is no Overview or Coinholder entry. Proposals uses the base route/fragment; Treasury and Members use dedicated routes.

The top-bar community picker was removed by user direction. Community selection remains available through the authorized community entry pages; retained picker source does not imply that it is visible in the current header. Invited participants keep restricted navigation. A community represents one DAO workspace, with discussions inside it.

Keyboard focus is explicit in workspace controls and loading/error recovery controls. Reduced-motion preferences disable transitions and smooth section scrolling. Form controls have a dedicated stronger boundary; decorative dividers remain quieter. Autofill colors follow the theme for inputs, textareas, and selects.

### Calculated contrast pairs

These ratios were calculated from the current opaque CSS colors using WCAG relative luminance, then rounded to two decimal places for display. They describe the listed pairs, not a complete accessibility certification. Normal text should meet at least 4.5:1; qualifying large text has a 3:1 threshold. See [W3C: Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Required control boundaries and state indicators should meet 3:1 against adjacent colors; see [W3C: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

| Use | Foreground | Background | Ratio |
| --- | --- | --- | ---: |
| Light body text | `#1c1917` | `#faf8f4` | 16.49:1 |
| Light muted text | `#57534e` | `#faf8f4` | 7.19:1 |
| Light accent text | `#92600f` | `#faf8f4` | 5.07:1 |
| Dark body text | `#f5f3ed` | `#141412` | 16.62:1 |
| Dark muted text on a panel | `#bdbeb4` | `#1e1f1c` | 8.82:1 |
| Dark accent text on a panel | `#f2c866` | `#1e1f1c` | 10.43:1 |
| Primary action text, Light | `#1c1917` | `#f4b728` | 9.70:1 |
| Primary action text, Dark | `#181c13` | `#f4b728` | 9.59:1 |
| Light input boundary | `#8f8574` | `#ffffff` | 3.64:1 |
| Dark input boundary | `#8b907d` | `#1e1f1c` | 5.03:1 |
| Dark positive status | `#a0dfb7` | `#203c2c` | 7.87:1 |
| Dark error message | `#ffc1ad` | `#43271f` | 8.71:1 |

## Proposal-first workspace

The supplied Politeia screenshot guides the information hierarchy: proposals occupy the main column, with concise community and treasury context alongside. The implementation retains Zcash colors and branding. On desktop, the opening view shows proposal filters/search, several proposal cards, membership and proposal counts, both available treasury amounts, and the recent-activity disclosure.

Cards show proposal titles, dates, requested amounts, deadlines and discussion links. Short labels, aligned metadata and borderless card surfaces reduce visual noise. Search and navigation retain visible keyboard focus without permanent decorative outlines.

The local Orchard sample workspace illustrates the first three proposals with **Approved** (10 Yes / 2 No), **Rejected** (3 Yes / 9 No), and **In progress** (5 Yes / 2 No) vote bars. Each shows percentages of votes cast, participation out of 12 eligible members, and a visible **Simulated** label. Examples are assigned before filtering so their outcomes remain stable when searching or changing tabs. Completed examples appear under Closed; the ongoing example appears under In progress.

These are presentation-only examples, gated by `WORKSPACE_PREVIEW=true`, a non-production environment, and the `preview_orchard` community ID. Stored proposal statuses, vote records, and detail-page data remain unchanged. Other communities and production do not show simulated results. The bars make no quorum, binding approval, payment, or validated tally claim.

Each treasury shows its exact available amount and purpose. Native keyboard-accessible disclosures reveal the reserved/committed/paid breakdown and authorized funding/allocation actions. Recent activity expands to show the latest three records. Narrow layouts stack community context after the proposal board; the Treasury navigation link provides direct access.

## Members

The Members page lives at `/communities/[communityId]/members` within the shared theme and header. It uses a searchable All/Active/Removed roster, mobile rows and membership-proposal links. Initial setup shares the form styles, labelled input, pending state and recoverable errors; it is available only before roster initialization. Existing vote-based behavior remains; selectable membership policy and ZcashNames are pending. The legacy `/admin/members` entry redirects to the authorized community's page.

## Validation status

The October 8, 2026 workspace passed **394 tests across 74 files**, including **four PostgreSQL integration tests**. Members coverage checks current community access, legacy redirects, filters/search, membership-source links, initial-setup eligibility, and failed-submission recovery. Vote-preview coverage checks outcome examples, vote shares and accessible labels, preview containment, stable filtering, and unchanged source statuses. Dedicated appearance tests cover initial server markup, malformed-cookie fallback, persistence, shared-layout navigation, system-preference first clicks, and blocked storage. Community picker tests cover access-limited options, search, selection, and focus behavior.

The production build and TypeScript checks passed. Lint passed with two existing image warnings. Browser checks covered both explicit themes, System responding to light and dark preferences, reload persistence, proposal discussion, treasury forms, and phone/tablet/desktop layouts. No horizontal overflow was observed in the inspected views; the restarted preview reported no browser errors or warnings.

These are local validation results. No production deployment was performed. The preview uses recorded budgets and sample data; the design does not imply connected wallet balances or executed payments.
