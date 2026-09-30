# Coinholder-Directed Retroactive Grants Program (`/coinholders`)

The program has its own app in the sidebar, directly above ZCG, labelled **CD Retroactive Grants** with the official name, _Coinholder-Directed Retroactive Grants Program_, as its tooltip and as the Overview's title (the breadcrumb names the program on the other pages). The Financial Privacy Foundation appears only as the program's administrator (its app is "FPF · Program administrator"), as the program proposal describes it: FPF runs submissions, review summaries, KYC and reporting; coinholders decide; the key-holders pay and can veto (ZIP 1016).

## Pages

The sidebar lists three pages under the app; the app link itself opens the overview.

| Path                      | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/coinholders`            | Overview: the latest round in one card; participation and approval by round; **Value of the vote** (the ZEC that voted in each round at the close of the day voting ended and at today's live price, beside the money requested and funded, as a paired-bar chart and a table); how the rules evolved; the next round and the rules.                                                                                                                                                    |
| `/coinholders/results`    | Results in one screen. A segmented control picks a round with `?round=<id>` (`q3-2026` by default, `q2-2026`, `q1-2026`, `q4-2025`, `ratification-2025`, case-insensitive); `?round=all` shows every verdict of every round with search, filters and CSV export. Each round opens with one card: status and sources, what happened, the calendar as a stepper (phase, days, dates) and its figures; then one quiet filter row (outcome, search, sort) above the per-proposal vote bars. |
| `/coinholders/fund`       | The Coinholder-Controlled Fund: live balance and value, inflow, what is still to come, what the approved Q3 grants take of the balance, the story of the fund from NU6 to the third halving, and the ZIP 1016 disbursement steps.                                                                                                                                                                                                                                                       |
| `/zcg/coinholder/copilot` | Coinholder Copilot, unchanged URL, listed under the program.                                                                                                                                                                                                                                                                                                                                                                                                                            |

Old addresses redirect permanently: `/zcg/coinholder` and `/coinholder` to the overview, `/zcg/coinholder/votes` and `/coinholders/votes` to `?round=all`, `/coinholders/<round>` to `/coinholders/results?round=<round>`, and `/zcg/coinholder/pool` to the fund (FPF's Q3 review post links to `/zcg/coinholder`).

Participation is the largest single vote of a round (the most ZEC cast on any one proposal or poll question), over the 21,000,000 ZEC supply (the ZIP 1016 minimum of 420,000 ZEC is 2%). The fund page shows no past payouts: only the approved grants still awaiting payment, valued at today's price.

## Data

Everything is curated in `src/lib/coinholder/rounds.ts` (rounds, newest first) and `src/lib/coinholder/program.ts` (rules, key-holders, FPF's role, next round), with the source of each figure beside it:

- **Outcomes**: each round's official results post. Q3 2026 uses FPF's post as edited on 2026-09-30, when Connaugh Zcash Videos moved from Abstain to Funded after str4d pointed out that a simple majority under ZIP 1016 leaves abstentions out (17 funded, 20 rejected).
- **Q3 2026 tallies**: the finalized round `2cba66eb…5e01` on the Valar Group vote chain (`/shielded-vote/v1/vote-summary/<round>`; values are in units of 0.125 ZEC, divide by 8). The Valar, Zcash Foundation, ZODL and Shielded Labs vote servers return byte-identical copies. The figures match, to the cent, the table T. S. Felstead (VASP Holdings) transcribed from the Vizor wallet (forum thread 57910) and every leading answer, share and ZEC total on zakura.com/voting.
- **Q1 2026 tallies**: the Voting Authorities' recount with the published election seed (thread 55048, post 17). The seventh question, on rescinding the Q4 2025 ECC grant, was discarded for skipping the review period; its votes were never published.
- **Q4 2025 tallies**: FPF's results summary (thread 53487). No Abstain option; one transparent voter's 105,002 ZEC is in every total. The ECC grant passed and was later vetoed by Shielded Labs and the Zcash Foundation.
- **Ratification (September 2025)**: thread 52013, post 38, and the Shielded Labs summary.

Approval shares on the page are of the ZEC voted for or against; abstentions are shown beside them. Zakura shows the leading answer's share of all ZEC, abstentions included; both come from the same tallies. The "asked for a lower amount" line appears under a question when that option drew at least 5% of the votes for or against.

`/api/zcg/coinholder/round` keeps its fields and adds `programName`, `administrator`, `page`, `round.status`, `round.resultsUrl`, `round.talliesSource`, `round.turnout`, `round.nextRound` and, per proposal, `outcome` and `tallyZec`. Zarvis reads it for coinholder questions.

## Value of the vote

Each round stores `closePrice`: the Bitfinex ZEC/USD daily close (UTC) on the day voting ended (`src/data/funding/days.json` holds the same series; a test checks every round against it). `voteValue()` in `derive.ts` values the largest single vote at that close and at the live quote (`currentZecUsdQuote`, so `/coinholders` renders dynamically), and sets the requested amount against it. How many holders voted is not published for any round, and the shielded vote does not reveal it: ballot counts measure submissions (and on the Q3 vote chain, revealed encrypted shares), so the page uses ZEC voted only.

## Official outcomes on the FPF and ZCG pages

The official Coinholder sheet lags the results post, and the site publishes status changes the next day (Brasília time). `src/lib/coinholder/official-status.ts` overlays the curated outcomes from `ROUNDS` on coinholder rows, matched by the FPF GitHub issue number in the row's link: proposals in a closed round show Approved, Rejected or Keyholder veto, and approved grants the sheet still marks Open show **Awaiting payment**. It is used on `/zcg/fpf`, `/zcg/proposals`, `/zcg/grants` and `/zcg/grant`; proposals outside a closed round keep the database status. The raw data API and Zarvis still read the sheet as imported.

## When a round closes

1. Add the round at the top of `ROUNDS` (it becomes the default tab of `/coinholders/results`) with outcomes from the results post and tallies from the vote chain, and move the previous round down.
2. Give its `windows` `start`/`end` dates (the stepper counts days from them) and its `closePrice` (Bitfinex daily close on the day voting ended). Update `PROGRAM.nextRound` from the results post, the pending entry in `PAYOUTS` (the fund page reads it) and the round's entry in `src/data/governance/record.json`.
3. `npx vitest run src/lib/coinholder` checks counts, requested totals, the 0.125 ZEC grid, the published turnout range and that every outcome agrees with ZIP 1016 as applied; extend it with the new round's figures.
