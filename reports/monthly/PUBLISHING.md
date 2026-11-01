# Monthly reading-set publication

The Editorial 4.0 format produces **Monthly** and **Operations** PDFs plus the **Sources & Data** view. The public format contract and reference PDFs live in this directory. This guide describes validation; it does not authorize a scheduled task, push or deployment.

## Validate the format and evidence

1. Read `OPENZCASH-MONTHLY-PROMPT.md`, `reading-set-contract.json`, `DESIGN-SYSTEM.md`, `reference.json` and `README.md` from this repository. Run `python reports/monthly/check_monthly_standard.py --scheduled-for YYYY-MM-01` to verify the format, reference hashes and intended reporting period.
2. If a private scheduled task is in use, verify its current status and cadence with `--automation-file`. To compare its exact identity and instructions, supply the expected task ID, target thread ID and prompt from private configuration through the checker's optional arguments. The public template in `AUTOMATION-PROMPT.md` is not a saved prompt or an authorization record.
3. Refresh data from official sources, reconcile amounts and registers, and complete editorial and visual review of both PDFs and Sources & Data. The reference PDFs establish design only; they do not supply current facts or approval.
4. Use `import_reading_set.py --source-dir /path/to/reviewed-set` only after review is complete. The source directory must contain `reading-set.json`, both final PDFs, page manifests and matching `review.json`. The importer verifies the documents and stages immutable assets before replacing the catalog. `import_publication.py` is a legacy one-PDF workflow.
5. Run the financial, source, review and reader checks, focused adapter tests, lint, type check and production build. Inspect the integrated reader on desktop and compact layouts. A successful build alone does not establish a reviewed publication.

## Production publication

Keep deployment identifiers, credentials, private evidence and approval records in private operating configuration. Confirm the successful live deployment and its full source commit before preparing a clean checkout. Preserve existing unrelated apps, financial fixes and editions. If the baseline changed, revalidate against the new commit.

Push or deploy only after the required approval and all gates pass. Stage both immutable PDFs, their page assets, source registers and one catalog entry together; do not publish one half of the set. After deployment, confirm the public reader, both served PDF hashes, source counts, links and navigation. Record the commit, deployment, hashes, period and review in the private publication record. If evidence or authorization is missing, retain the current live edition and report the specific blocker.
