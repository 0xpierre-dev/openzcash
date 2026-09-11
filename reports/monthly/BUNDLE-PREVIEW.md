# Monthly and Operations preview

Open `/monthly-preview`. Two PDFs share the month selector: **Monthly** and **Operations**. **Sources & Data** is a searchable register, not a third publication. The old `publication=voter` URL remains an alias for Operations.

This edition uses September 1-10, 2026. It is a local layout and editorial preview, not a new monthly close or a production deployment. The source cutoff, financial values and period are frozen. ZCG evidence collected on September 11 was reconciled to the September 10 UTC cutoff using issue timestamps, status history, the official sheet and captured minutes. Later submissions are excluded.

## Editorial ownership

- **Monthly (10 pages):** cover; ZF, Shielded Labs, Tachyon and Zakura; the four-wallet grid at page 6; hardware; supporting infrastructure; new products at page 9; concise highlights and an **Open Operations** link at page 10.
- **Operations (20 pages):** payments and the full paid-installment ledger; seven approved and six declined ZCG requests; sixteen ZCG applications under review; NU7 advisory polls; all thirty-seven Coinholder requests; community reports, field activity and education; product status and open questions; treasury valuation; Zcon7.
- **Sources & Data:** 107 sources, 29 ZCG proposal/decision records, 37 Coinholder requests and 32 community records. Records include search, pagination, original links and CSV export. Source details and unchanged community coverage remain accessible without adding generic closing pages.

Monthly carries delivered work and headline product updates. Operations carries funding, proposal status, committee outcomes, public voting, community activity and the supporting details. Do not move decisions or the payments ledger back into Monthly. Product highlights can appear in Monthly; Operations adds status and unresolved questions rather than repeating the same copy.

ZCG committee decisions are distinct from Coinholder ballots. A request, an approved budget and a paid installment are different measurements. The seven approvals were published in the September 2 minutes; their recorded decision dates are in August. Four declines appeared in those same minutes; two more are dated September 4. They must not be relabeled as seven September approvals. ZECsy's $550,000 is its original request; the minutes approved nine-month milestones, not that full amount. Zaino's audit request is an indicative $60,000-$120,000 range. Flutter SDK's Markdown-formatted request is $10,000.

## Reproduction and guardrails

Run `prepare_zcg_preview.py --evidence-dir /absolute/zcg-captures --source-dir /absolute/september-01-10-issue` to reconstruct the reviewed ZCG fixture. Public source URLs, capture times, hashes, exclusions and cutoff reasoning are retained in `zcg-preview-data.json`; raw captures remain with the local artifact evidence. This date-specific fixture fails on an unreviewed candidate or an unresolved status change after cutoff.

Run `build_bundle_preview.py --source-dir /absolute/september-01-10-issue --preview-origin http://127.0.0.1:4193` to build both PDFs, page manifests, thumbnails and the shared source registers. The Monthly-to-Operations link works in the same reader; the PDF itself links to the supplied preview origin. Use the actual publication origin when producing an externally hosted edition. Never ship a localhost link as a public production link.

The UI preserves each PDF's current page, download and count. Both arrow controls advance one page. The generator bounds text widths, preserves exact amounts and external links, and removes obsolete thumbnails. Relevant PDF pages, manifest links, tab switching, end states and the cross-document link must be inspected after changing the editorial structure.

The production importer, existing monthly quality sign-off and recurring schedule are unchanged by this preview. Adoption into production requires updating their multi-document contract and monthly instructions together, with a production review for each new period.
