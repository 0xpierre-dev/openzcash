# Monthly publication

The approved workflow produces one English PDF, reviews it, and adds that exact file to the public reader at `https://openzcash.org/monthly`. The recurring publication runs on the first day of each month at 09:00 in America/Sao_Paulo, beginning October 1, 2026. The schedule is managed by Codex; these repository files do not execute a server cron. The local Codex host must be available for scheduled work.

## Issue dates and review

On October 1, use publication month `2026-10`, financial month `2026-09`, comparison month `2026-08`, and development-window start `2026-09-01`. Derive those dates afresh for later months. Close financial totals at the end of the previous calendar month; separately date any publication-day briefing or upcoming event. A delayed run retains the intended monthly close and states its actual evidence cutoff.

Follow `OPENZCASH-MONTHLY-PROMPT.md`, `DESIGN-SYSTEM.md`, `README.md` and `publication-contract.json`. Use fresh source captures and complete funding, ecosystem and community registers. Requested, approved and paid amounts remain distinct. Treasury balances and the price used to value them retain separate dates. Keep the page-7 ZODL, Zingo, Vizor and Zkool grid and review every page. Previous issues supply the visual reference and data schema, never new facts or sign-off.

The recurring task includes publication after the required checks. A failed check, missing critical source or unverified production baseline must stop publication and produce an actionable failure report. Preserve the existing live edition. Never invent missing data, weaken a check, create an empty future issue, or reuse an earlier review.

## Production baseline

Production is deployed through Railway CLI uploads. The default Git branch is not sufficient evidence of what is live.

- Git remote: `https://github.com/Michae2xl/openzcash.git`
- Railway project: `5476eada-862a-47bd-9166-49be9933d33c`
- Production environment: `462383a7-783d-4a95-87b0-e4c4e76db893`
- Service: `ad10d745-f505-49ed-8f7e-5054ec572ab4` (`zbo`)
- Public reader: `https://openzcash.org/monthly`

Read the active successful production deployment and extract the full Git SHA from `meta.cliMessage` (`openzcash git:<SHA> ...`). Fetch the remote, verify that commit is available, and create a clean worktree from it. Preserve changes already in production, including other apps and financial fixes. Do not deploy a stale development checkout. If another deployment is in progress, wait for its outcome and resolve the baseline before proceeding.

## Import and deploy

1. Finish the production sequence, including actual editorial and visual review, final validation and a production record bound to the final PDF hash.
2. In the clean production worktree, run `python reports/monthly/import_publication.py --issue-dir /absolute/approved-issue`. Check the intended publication month and exact PDF hash. If the same monthly edition is already live with that hash, exit without duplicating it. Do not replace an existing edition without an explicitly requested correction.
3. Run the report quality gates, website integrity tests, lint, type check and production build. Inspect the integrated reader, page 7, navigation, source links, PDF download and complete-page fit. Keep all prior editions.
4. Commit only the new approved publication assets and catalog entry. Push the commit to the remote before deployment. Preserve credentials and private source captures outside public assets.
5. Recheck that production still uses the baseline SHA. Rebase and revalidate if it changed. Deploy the clean worktree with the explicit Railway IDs above and the message `openzcash git:<FULL_COMMIT_SHA> monthly-publication`.
6. Wait for Railway success, then verify the actual public reader, both asset and PDF responses, the deployed PDF hash, page navigation and a rendered PDF canvas. Also check the main app launcher and existing routes. Build success alone does not establish public-reader success.
7. Record the edition, Git SHA, deployment ID, PDF hash, evidence cutoff and confirmed live URL in the private production record. Report completion or an actionable failure. An unchanged, already published edition needs no repeated update.

The published PDF is a dated artifact. Its quotes, balances and source cutoff do not become live data after publication. Future monthly jobs refresh the sources and append a new issue using the same approved design.
