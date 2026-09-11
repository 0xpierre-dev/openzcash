# Monthly reading-set publication

The active workflow produces **Monthly** and **Operations**, plus **Sources & Data**, under Editorial 4.0. The existing Codex job remains monthly on day 1, at 09:00 America/Sao_Paulo, beginning October 1, 2026. This is a local scheduled task: the Codex host must be available. No cloud schedule or new automation is created by this format update.

## Authority, dates and active standard

First read `routine-activation.json`. Editorial 4.0 automatic publication remains disabled while its status is `pending-user-authorization`. The proposed scheduler update requires explicit confirmation after automatic approval review rejected it. Do not use the older job or these files to bypass that decision. Once the native update is authorized and verified, its recorded publication policy governs subsequent runs. The active saved instructions are in `/Users/maiconguimaraes/openzcash/reports/monthly`. Read `OPENZCASH-MONTHLY-PROMPT.md`, `reading-set-contract.json`, `DESIGN-SYSTEM.md`, `reference.json`, `README.md` and this guide from that durable path. The older instructions found in a production checkout must not override the approved two-PDF format.

For October 1 use publication month 2026-10, financial close September 1–30, comparison August and a separately verified evidence cutoff. Recompute calendar boundaries for every later run and preserve the intended close if execution is delayed. The two PDFs and sources share an issue identity and cutoff. Research all data again; reference PDFs establish design only.

A failed data check, missing critical source, unresolved export/import compatibility or unverified production baseline blocks publication. Keep the existing live edition. Never weaken the gates, reuse review, publish one half of the set or claim that a local preview is a production update.

## Production baseline

Production is deployed through Railway CLI uploads. The default Git branch is not sufficient evidence of what is live.

- Git remote: `https://github.com/Michae2xl/openzcash.git`
- Railway project: `5476eada-862a-47bd-9166-49be9933d33c`
- Production environment: `462383a7-783d-4a95-87b0-e4c4e76db893`
- Service: `ad10d745-f505-49ed-8f7e-5054ec572ab4` (`zbo`)
- Public reader: `https://openzcash.org/monthly`

Read the active successful production deployment and extract the full Git SHA from `meta.cliMessage` (`openzcash git:<SHA> ...`). Fetch the remote, verify that commit is available, and create a clean worktree from it. Preserve changes already in production, including other apps and financial fixes. Do not deploy a stale development checkout. If another deployment is in progress, wait for its outcome and resolve the baseline before proceeding.

## Prepare and publish the complete set

1. Read the durable active standard and verify its approved reference hashes with `check_monthly_standard.py`. Inspect the actual successful production deployment and use a clean worktree of its commit. Preserve unrelated apps, financial fixes and prior editions. Carry forward the approved monthly instructions and the relevant reviewed reader changes if production still has the legacy format; do not replace the entire checkout with an older preview.
2. Refresh sources, reconcile amounts and registers, compose both PDFs in the approved layouts and complete real editorial and visual review. Bind the new issue, evidence, renderer, each page and both final PDF hashes to the production record. The final Monthly page links to the Operations publication for the same issue on the public origin.
3. Verify or complete the two-publication adapter in that worktree before importing. The existing `import_publication.py` is a legacy single-PDF importer. Reuse its immutable assets, final review, hashing and catalog-last staging protections, but use a bundle-capable path for Monthly, Operations and the source registers. Compatibility work is part of this authorized run and must be tested. The public route must support the three tabs, independent PDF downloads/positions and the final-slide handoff. Do not infer support merely from `/monthly-preview` working.
4. Stage both immutable PDFs, their thumbnails/page manifests, source registers and one monthly reading-set catalog entry. Publish the catalog only after all assets are ready. If the exact full set is already live, finish without duplicating or overwriting it. An existing edition needs an explicitly requested correction before replacement.
5. Run the applicable financial/source/review gates and focused adapter/catalog tests, website integrity tests, lint, type check and production build. Inspect both PDFs and Sources & Data in the integrated reader. Verify Monthly pages 6, 9 and 10, all proposal rows, first/last-page states, both arrow controls, per-document downloads, preserved tab positions, desktop/compact complete-page fit and public cross-document links. No localhost links may appear in published output.
6. Commit only the approved monthly implementation changes needed for compatibility and the new reading set. Push the commit before deployment. Keep private source captures, restricted data and credentials out of public files. Recheck the live baseline and rebase/revalidate if it changed. Deploy with the explicit Railway IDs above and message `openzcash git:<FULL_COMMIT_SHA> monthly-publication`.
7. Confirm Railway SUCCESS and the actual public reader at `https://openzcash.org/monthly/{edition-id}`. Read back both served PDF hashes, source/register counts and asset responses; inspect the rendered canvases, navigation and Monthly-to-Operations handoff. Check the app launcher and existing routes. A successful build or upload alone is insufficient.
8. Record issue, dates, commit, deployment ID, both PDF hashes, source coverage, review and confirmed live URLs privately. Notify completion, failure or required user action through the existing task. Do not send posts, emails or third-party messages. An unchanged verified edition needs no repeated notification.

The schedule update saves the intended workflow; it is not a test of future data access or a deployment of the new reader. Every run must establish the matching generation, quality and live-publication proof separately.
