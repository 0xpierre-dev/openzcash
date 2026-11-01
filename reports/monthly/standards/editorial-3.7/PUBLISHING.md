# Monthly publication

This archived Editorial 3.7 workflow produced one English PDF, reviewed it, and added that exact file to the public reader at `https://openzcash.org/monthly`. These repository files do not activate a schedule or authorize future publication. Editorial 4.0 is the current format.

## Issue dates and review

On October 1, use publication month `2026-10`, financial month `2026-09`, comparison month `2026-08`, and development-window start `2026-09-01`. Derive those dates afresh for later months. Close financial totals at the end of the previous calendar month; separately date any publication-day briefing or upcoming event. A delayed run retains the intended monthly close and states its actual evidence cutoff.

Follow `OPENZCASH-MONTHLY-PROMPT.md`, `DESIGN-SYSTEM.md`, `README.md` and `publication-contract.json`. Use fresh source captures and complete funding, ecosystem and community registers. Requested, approved and paid amounts remain distinct. Treasury balances and the price used to value them retain separate dates. Keep the page-7 ZODL, Zingo, Vizor and Zkool grid and review every page. Previous issues supply the visual reference and data schema, never new facts or sign-off.

Publication requires separate authorization after the required checks. A failed check, missing critical source or unverified production baseline must stop publication and produce an actionable failure report. Preserve the existing live edition. Never invent missing data, weaken a check, create an empty future issue, or reuse an earlier review.

## Production baseline

Production is deployed through Railway CLI uploads. The default Git branch is not sufficient evidence of what is live.

- Public reader: `https://openzcash.org/monthly`

Keep repository and deployment identifiers in private operating configuration.

Read the active successful production deployment and extract the full Git SHA from `meta.cliMessage` (`openzcash git:<SHA> ...`). Fetch the remote, verify that commit is available, and create a clean worktree from it. Preserve changes already in production, including other apps and financial fixes. Do not deploy a stale development checkout. If another deployment is in progress, wait for its outcome and resolve the baseline before proceeding.

## Import and deploy

1. Finish the production sequence, including actual editorial and visual review, final validation and a production record bound to the final PDF hash.
2. In the clean production worktree, run `python reports/monthly/import_publication.py --issue-dir /absolute/approved-issue`. Check the intended publication month and exact PDF hash. If the same monthly edition is already live with that hash, exit without duplicating it. Do not replace an existing edition without an explicitly requested correction.
3. Run the report quality gates, website integrity tests, lint, type check and production build. Inspect the integrated reader, page 7, navigation, source links, PDF download and complete-page fit. Keep all prior editions.
4. Commit only the new reviewed publication assets and catalog entry after authorization. Push the commit to the remote before deployment. Preserve credentials and private source captures outside public assets.
5. Recheck that production still uses the baseline SHA. Rebase and revalidate if it changed. Deploy the clean worktree using the private deployment configuration and the message `openzcash git:<FULL_COMMIT_SHA> monthly-publication`.
6. Wait for Railway success, then verify the actual public reader, both asset and PDF responses, the deployed PDF hash, page navigation and a rendered PDF canvas. Also check the main app launcher and existing routes. Build success alone does not establish public-reader success.
7. Record the edition, Git SHA, deployment ID, PDF hash, evidence cutoff and confirmed live URL in the private production record. Report completion or an actionable failure. An unchanged, already published edition needs no repeated update.

The published PDF is a dated artifact. Its quotes, balances and source cutoff do not become live data after publication. Any future monthly job must refresh the sources and review a new issue against the current standard.
