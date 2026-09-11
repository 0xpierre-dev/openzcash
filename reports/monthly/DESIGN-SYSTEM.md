# OpenZcash Editorial

Design system 4.0 · Cover revision 2 · Monthly + Operations + Sources & Data

## Information hierarchy

Headline = conclusion. Subline = unique scope, period or status. Evidence = additional detail. Never repeat an abbreviated amount as an exact amount in the subline, or repeat a featured version/deadline in the headline. Omit generic sublines. Within a card, its label, title and body must each add information; remove a fourth card if it only restates a qualification already present. A logo containing the full name does not need another adjacent name; use the official symbol where the text heading supplies the name.

For treasury, a compact hero and its exact reconciliation-table total are a deliberate exception. Readable native event dates may accompany the unchanged official poster. Lookup-register identities, units, sources and cross-page context remain available. [The production standard](README.md) defines validation and review before final export.

## Format

16:9 landscape. Reference canvas: 1200 × 675 points. Keep the same page dimensions throughout the PDF. The viewer fits one complete page inside the available viewport, with paginated thumbnails and keyboard navigation.

Use 52-point outer margins and a 1096-point content width. The top masthead and rule establish continuity. Keep the bottom margin clear. Put the folio beside the section label in the top margin. Consolidate references, page mappings, extended qualifications and visual credits in Sources & Data, outside the two PDFs. Retain essential periods, units and status labels in the main content.

## Typography

| Role | Reference face | Reference size |
| --- | --- | --- |
| Cover headline | DIN Condensed Bold | Monthly 192 pt / Operations 160 pt |
| Cover metrics / captions | DIN Condensed Bold / Gill Sans | 74 pt / 21 pt |
| Page headline | DIN Condensed Bold | 44–50 pt |
| Primary metric | DIN Alternate Bold / DIN Condensed Bold | 36–100 pt |
| Body | Gill Sans | 18–22 pt |
| Item heading | Gill Sans SemiBold | 22–25 pt |
| Table content | Gill Sans / SemiBold | 14–17 pt |
| Status / category | Gill Sans SemiBold | 10–12 pt |
| Source appendix title / metadata | Gill Sans SemiBold / regular | 18 / 13.5–15 pt |

These sizes refer to the 1200 × 675 canvas. Preserve the hierarchy at other scales. Embed fonts. If a face is unavailable, select one compatible display/body pair and verify line breaks; do not silently substitute a third face. Dense registers can use the lower table range. Main narrative cannot.

## Color

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#171917` | Main text, dark feature pages |
| Paper | `#F7F5EF` | Warm editorial background |
| White | `#FFFFFF` | Charts and alternating table rows |
| Gold | `#EFB92F` | Monthly identity and priority metrics |
| Operations green | `#325C4E` | Operations identity and restrained accents |
| Muted | `#51564F` | Supporting text |
| Rule | `#CFD1C7` | Quiet dividers |
| Grant chart | `#BE891F` | Paid-grant measurements |
| Governance chart | `#385A47` | Requested-funding measurements |

Official assets keep their own colors. Vizor headings may echo its burgundy identity. Do not recolor a logo to fit the palette. Interior features sit directly on the paper background, with contrast supplied by typography and restrained color. Test marks with transparent centers against the actual background.

## Page families

- **Cover:** use the shared revision 2 composition in the reference PDFs. Divide the canvas into a 784 pt ink panel and a 416 pt identity panel: gold for Monthly, green for Operations. Center the single OPENZCASH masthead, publication title and short purpose on the left axis at x=392. Set three equal metric columns within x=64–720, with 24 pt gaps, 74 pt values and 21 pt captions on two aligned lines. Keep all value baselines equal and shorten number formatting before reducing type. Center the issue label, Zcash artwork and reporting period on the right axis at x=992. Use the original vector Zcash mark, retaining its gold color and geometry, with subtle decorative engraved contours on both publications. The contours have no data meaning. Set the reporting period around 49 pt, with a quiet 12 pt partial-period label only when applicable. Do not repeat the month as a giant decorative numeral or add cover-footer copy. Dates and metrics always come from the current issue.
- **Navigation:** use chapter controls and PDF bookmarks. Monthly has no extra contents page; its tenth and final page carries concise highlights and a visible **Open Operations** button. The button opens the matching issue in the same reader, with a real public URL in the published PDF.
- **Organization / project:** float the authentic logo directly on the paper background beside three or four concise updates. Remove decorative dark or colored logo panels. Center the logo, organization name and supporting label on the same column axis; use approximately 38 pt for names and 16 pt for status labels in high-contrast ink or muted text. Space update rows according to the actual text height so dividers never cross a second line. Include Zakura with its authentic flower and wordmark, centered release number and readable status.
- **Wallets / Monthly page 6:** one equal 2×2 grid: ZODL top left, Zingo top right, Vizor bottom left, Zkool bottom right. Use original transparent marks, one name per cell, versions, platforms, release dates and concise changes. Keep the paper background, quiet dividers and restrained brand accents. Keep each slot even when there is no verified update; label that gap instead of inventing a release. Other wallets are supplementary coverage sourced from official repositories and OpenZcash Wallets, never a fifth cell. Funding and experimental release states remain explicit.
- **Analysis:** one chart and a small evidence column. Export the reviewed native chart as a transparent PNG at 3× when available; use no backplate. Keep all labels, marks and units intact, with searchable surrounding text.
- **Ledger:** right-aligned values, restrained alternating rows, explicit currency and period. Logos may identify beneficiaries but never replace names.
- **Field report:** a real, credited photo and concise delivery/funding context.
- **Regional dispatch:** readable editorial columns, source dates and small authentic community marks.
- **Community metrics:** large colored numbers, centered labels around 16 pt and an original logo directly on paper, without a filled feature card.
- **Governance:** a centered deadline feature on paper, restrained accent color for time, plus the actual questions or decisions. Avoid implying that a deadline is an outcome.
- **Treasury:** a dated balance and separately dated market valuation. Use a concise indicative-value feature beside a table comparing recorded and repriced USD values. Explain the price-only difference in the main content. Keep source dates and quote timestamps visible; never label revaluation as an inflow.
- **Event:** official current artwork, date/place and verified event/participation status.
- **Sources & Data:** complete searchable source, ZCG, Coinholder and community registers with readable links. It is a view, not a PDF appendix. Detailed proposal rows belong in Operations; avoid generic closing pages.

Avoid three consecutive pages with the same narrative layout. Paginated proposal/ledger registers are exempt: consistency is useful there. Use whitespace intentionally, without oversized empty placeholders or ornamental chart-like shapes that could be mistaken for data.

## Logo and image handling

Prefer official transparent PNG, WebP or vector source files. Otherwise use the highest practical source resolution and size small assets accordingly. Preserve the full artwork and aspect ratio. Project Tachyon uses the transparent original from tachyon.z.cash; explicitly identify it as Project Tachyon when shown within a shared Valar Group / Tachyon column. ZecHub and Zcash en Español also have official transparent originals. Avoid decorative rectangular backing panels and verify the actual alpha channel; a white rectangle is not transparency. Keep intrinsic badge shapes and brand colors intact. Keep minimum clear space of roughly one quarter of the mark's height unless the brand specifies otherwise. Do not crop text from wordmarks, add effects, trace or synthesize replacements. Normal editorial text is the fallback when no verified mark is available.

The asset manifest records original URL, parent source page when known, origin, retrieval timestamp, hash and any format-only conversion. Existing OpenZcash catalog assets are labeled as catalog assets, not falsely presented as newly fetched originals. Do not imply sponsorship or endorsement through placement.

Use photos at an informative scale. Cropping for layout may preserve the story, but must not remove relevant context. Screenshots require a capture date and must not pass off visible live metrics as closed-month observations.

## Export and review

Use searchable PDF text and embedded fonts. Reuse the same reviewed datasets, current filters and chart definitions as the evidence view. Include source URLs, section bookmarks and reader navigation. Keep one final Monthly PDF and one final Operations PDF for the issue. Older revisions remain working history. Sources & Data is the third tab and has no PDF download.

Render and inspect all pages before delivery. Compare the final PDF to the evidence view. Check the cover, smallest table text, every logo, the densest proposal register, all chart labels, internal links and the last page. The viewer must display one full page without horizontal or vertical scrolling. Render the PDF at max(2, devicePixelRatio) and re-render after resizing; use PNGs only for thumbnails. Confirm canvas resolution against displayed size, remove stale-page flashes during navigation, and check both desktop and compact viewports. All PDF text faces must be embedded. Keep one Sources & Data view with working original-source links and accurate publication/page references.

## Approved reading set

The reference is `reference.json` and its two immutable PDFs under `standards/editorial-4.0/`. Monthly is fixed at 10 pages: cover, four team pages, wallets, hardware, supporting stack, new products, highlights/handoff. Product announcements are page 9; highlights and the Operations button are page 10. Operations uses green rather than gold for its publication identity and expands through substantive sections and readable tables. Its sample has 20 pages; future counts follow current evidence. Source/register counts are never decorative fixed metrics.

Monthly and Operations covers show their distinct publication name once. Cover revision 2 uses the shared centered composition and native vector Zcash artwork described above; `reference.json` selects that revision while earlier reference files remain available. Interior pages stay on the same paper background. Do not add filled panels behind wallets, project logos, charts, treasury values, deadline features or community metrics. Official event art and photos are the exception. Preserve a quiet folio in the top margin and clear footers.
