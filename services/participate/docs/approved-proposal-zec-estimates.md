# Approved proposal ZEC estimates

10 October 2026 · Local Participate preview

Approved historical proposal cards show their verified USD budget at the right of the title and a compact **≈ X.XX ZEC today** disclosure beneath it. On narrow screens, the budget and estimate share a row below the title. Clicking or tapping reveals the budget's decision source, the exact CoinGecko USD/ZEC rate and its UTC timestamp. Keyboard users can open the control and dismiss it with Escape; focus returns to the trigger.

The estimate converts the **entire approved grant budget**, not an outstanding balance. Previous disbursements are not subtracted. Fees are excluded, the budget stays denominated in USD, and each actual payment uses its payment-day rate. This display neither defines the committee's official price provider nor guarantees a future ZEC payment.

## Card hierarchy

The support percentage leads the title, with turnout beside the decision date. Support is approvals divided by the five committee seats; turnout counts all recorded positions, including abstentions. A 4–1 decision therefore shows 80% support and 100% turnout. No turnout is invented for imported pending applications.

A single official current-status label replaces the redundant corner badge. Sectors stay visible; “+ labels” discloses the original workflow and milestone labels without changing their names, colors or stored records. Member feedback opens above or below the vote rail according to available space, in a compact pop-up with the published summary and source. Hover, tap, Escape and focus return are supported.

## Reviewed budget annotations

The following amounts and approval outcomes were checked in the official ZCG meeting minutes on 10 October. No reduced approval amount was recorded for these four decisions:

| Proposal | Approved USD budget | Decision source |
| --- | ---: | --- |
| GraphSense shielded accounting repair | $8,000 | [September 28 minutes, part 1](https://forum.zcashcommunity.com/t/zcash-community-grants-zcg-meeting-minutes-9-28-2026/57928/1) |
| Human-readable Ironwood verification | $8,000 | [September 28 minutes, part 2](https://forum.zcashcommunity.com/t/zcash-community-grants-zcg-meeting-minutes-9-28-2026/57928/2) |
| Zcash World, Mumbai | $20,300 | [September 14 minutes](https://forum.zcashcommunity.com/t/zcash-community-grants-meeting-minutes-9-14-2026/57615/1) |
| Zcash Arabia | $27,000 | [August 31 minutes, part 2](https://forum.zcashcommunity.com/t/zcash-community-grants-meeting-minutes-8-31-2026/57394/2) |

These are separate display annotations in `lib/data/zcg-approved-budgets.ts`. The original proposal snapshots, archived files and anchored hashes remain unchanged. An approved label alone does not establish an approved amount: a card needs a reviewed budget annotation before it receives a ZEC estimate. Rejected and pending proposals retain their requested USD amounts without an estimated payout.

## Quote lifecycle

The public, read-only `GET /api/participate/zec-price` reuses the existing CoinGecko adapter. Its [simple-price endpoint](https://docs.coingecko.com/reference/simple-price) supplies `last_updated_at`; the exact decimal rate is retained as an integer scaled by 10^8. Only public rate and timestamp fields reach the client. No authentication, wallet operation, database write, credit debit or persisted payment quote is involved.

One request serves the whole proposal list. Provider requests are coalesced and normally refreshed after 60 seconds. The public display may retain the last price during a temporary provider failure only within its original validity window, without changing its source or retrieval timestamp. Provider failures trigger a 15-second public-request cooldown and a sanitized operational warning, at most once per minute. Persisted funding quotes keep their stricter refresh behavior.

Visible lists check one minute after a successful response and on return to the tab. A failed browser refresh retains a still-valid estimate and retries after 15, 30 and then 60 seconds, without overlapping requests or polling hidden tabs. A source price expires after five minutes or at UTC midnight, whichever comes first. The server rejects old, future, malformed and extended quotes. The browser display alone tolerates up to two seconds of clock difference for source/retrieval timestamps. It preserves the original timestamps and exact expiry, grants no expiry grace, and never accepts a next-UTC-day quote early. Persisted financial quotes retain strict zero-tolerance validation. An independent expiry timer removes amounts even if a refresh stalls; **ZEC estimate unavailable** appears only when no valid quote remains, preserving the USD amount. No fabricated or expired fallback is shown.

Conversion reuses exact integer USD cents and rate arithmetic, rounding up to the next zatoshi, then rounds the approximate card display to two ZEC decimals. Positive amounts below 0.01 ZEC are identified as such rather than displayed as zero. Exact approved budgets and provider rates remain available in the disclosure.

## Validation

123 targeted tests passed across card interaction, all four estimates, shared refresh, provider errors, expiry during a pending refresh, hidden-tab polling, quote arithmetic, public API responses, preserved source decisions and signed-decision verification. The shared signed-decision test fixture was updated to supply the newly required forum topic. Existing archived source records still match their original snapshots.
