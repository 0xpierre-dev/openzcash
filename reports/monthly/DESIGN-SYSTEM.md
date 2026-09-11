# OpenZcash Editorial

Design system 3.7 · Fixed-page monthly ecosystem publication

## Information hierarchy

Headline = conclusion. Subline = unique scope, period or status. Evidence = additional detail. Never repeat an abbreviated amount as an exact amount in the subline, or repeat a featured version/deadline in the headline. Omit generic sublines. Within a card, its label, title and body must each add information; remove a fourth card if it only restates a qualification already present. A logo containing the full name does not need another adjacent name; use the official symbol where the text heading supplies the name.

For treasury, a compact hero and its exact reconciliation-table total are a deliberate exception. Readable native event dates may accompany the unchanged official poster. Lookup-register identities, units, sources and cross-page context remain available. [The production standard](README.md) defines validation and review before final export.

## Format

16:9 landscape. Reference canvas: 1200 × 675 points. Keep the same page dimensions throughout the PDF. The viewer fits one complete page inside the available viewport, with paginated thumbnails and keyboard navigation.

Use 52-point outer margins and a 1096-point content width. The top masthead and rule establish continuity. Keep the bottom margin clear. Put the folio beside the section label in the top margin. Consolidate references, page mappings, extended qualifications and visual credits at the end. Retain essential periods, units and status labels in the main content.

## Typography

| Role | Reference face | Reference size |
| --- | --- | --- |
| Cover headline | DIN Condensed Bold | 100–150 pt |
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
| Gold | `#E8B338` | Issue identity and priority metrics |
| Muted | `#51564F` | Supporting text |
| Rule | `#CFD1C7` | Quiet dividers |
| Grant chart | `#BE891F` | Paid-grant measurements |
| Governance chart | `#385A47` | Requested-funding measurements |

Official assets keep their own colors. Vizor headings may echo its burgundy identity. Do not recolor a logo to fit the palette. Interior features sit directly on the paper background, with contrast supplied by typography and restrained color. Test marks with transparent centers against the actual background.

## Page families

- **Cover:** show the publication name once, as the main headline. Omit the small repeated masthead. Include the issue/date, one geometric issue device and three supported signals. Set the three metrics around 52 pt, with 19 pt captions on two aligned lines; fit longer values to their column width. Use 15–18 pt for the issue, date and supporting labels, and 24 pt for the evidence period. Keep conceptual graphics separate from data marks.
- **Contents:** direct section navigation after the cover; omit the selective highlights/digest page.
- **Organization / project:** float the authentic logo directly on the paper background beside three or four concise updates. Remove decorative dark or colored logo panels. Center the logo, organization name and supporting label on the same column axis; use approximately 38 pt for names and 16 pt for status labels in high-contrast ink or muted text. Space update rows according to the actual text height so dividers never cross a second line. Include Zakura with its authentic flower and wordmark, centered release number and readable status.
- **Wallets / slide 7:** one equal 2×2 grid: ZODL top left, Zingo top right, Vizor bottom left, Zkool bottom right. Use original transparent marks, one name per cell, versions, platforms, release dates and concise changes. Keep the paper background, quiet dividers and restrained brand accents. Keep each slot even when there is no verified update; label that gap instead of inventing a release. Other wallets are supplementary coverage sourced from official repositories and OpenZcash Wallets, never a fifth cell. Funding and experimental release states remain explicit.
- **Analysis:** one chart and a small evidence column. Export the reviewed native chart as a transparent PNG at 3× when available; use no backplate. Keep all labels, marks and units intact, with searchable surrounding text.
- **Ledger:** right-aligned values, restrained alternating rows, explicit currency and period. Logos may identify beneficiaries but never replace names.
- **Field report:** a real, credited photo and concise delivery/funding context.
- **Regional dispatch:** readable editorial columns, source dates and small authentic community marks.
- **Community metrics:** large colored numbers, centered labels around 16 pt and an original logo directly on paper, without a filled feature card.
- **Governance:** a centered deadline feature on paper, restrained accent color for time, plus the actual questions or decisions. Avoid implying that a deadline is an outcome.
- **Treasury:** a dated balance and separately dated market valuation. Use a concise indicative-value feature beside a table comparing recorded and repriced USD values. Explain the price-only difference in the main content. Keep source dates and quote timestamps visible; never label revaluation as an inflow.
- **Event:** official current artwork, date/place and verified event/participation status.
- **Appendix:** consistent tables, complete names, readable links, no selective omissions.

Avoid three consecutive pages with the same narrative layout. Appendices are exempt: consistency is useful there. Use whitespace intentionally, without oversized empty placeholders or ornamental chart-like shapes that could be mistaken for data.

## Logo and image handling

Prefer official transparent PNG, WebP or vector source files. Otherwise use the highest practical source resolution and size small assets accordingly. Preserve the full artwork and aspect ratio. Project Tachyon uses the transparent original from tachyon.z.cash; explicitly identify it as Project Tachyon when shown within a shared Valar Group / Tachyon column. ZecHub and Zcash en Español also have official transparent originals. Avoid decorative rectangular backing panels and verify the actual alpha channel; a white rectangle is not transparency. Keep intrinsic badge shapes and brand colors intact. Keep minimum clear space of roughly one quarter of the mark's height unless the brand specifies otherwise. Do not crop text from wordmarks, add effects, trace or synthesize replacements. Normal editorial text is the fallback when no verified mark is available.

The asset manifest records original URL, parent source page when known, origin, retrieval timestamp, hash and any format-only conversion. Existing OpenZcash catalog assets are labeled as catalog assets, not falsely presented as newly fetched originals. Do not imply sponsorship or endorsement through placement.

Use photos at an informative scale. Cropping for layout may preserve the story, but must not remove relevant context. Screenshots require a capture date and must not pass off visible live metrics as closed-month observations.

## Export and review

Use searchable PDF text and embedded fonts. Reuse the same reviewed datasets, current filters and chart definitions as the evidence view. Include source URLs, section bookmarks and contents navigation. Keep a single final PDF filename for the issue; older revisions are working history, not separate user-facing reports.

Render and inspect all pages before delivery. Compare the final PDF to the evidence view. Check the cover, smallest table text, every logo, the densest appendix, all chart labels, internal links and the last page. The viewer must display one full page without horizontal or vertical scrolling. Render the PDF at max(2, devicePixelRatio) and re-render after resizing; use PNGs only for thumbnails. Confirm canvas resolution against displayed size, remove stale-page flashes during navigation, and check both desktop and compact viewports. All PDF text faces must be embedded. Keep one source index with working original-source links and accurate page references.
