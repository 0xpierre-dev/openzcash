# Proposal publication and Zcash evidence

10 October 2026 · Product decisions and delivery contract · Implementation pending where marked

Implementation update: the [Participate editor](./participate-submissions.md) now supports private account drafts, exact native revision packages and local publication with 20 demo Zcred. Its public records have no official committee review or automatic chain anchor. The production credit reservation and verified-anchor settlement requirements below remain pending.

## Product direction

Build a proposal workspace that keeps the GitHub and forum workflow useful while adding recoverable proposal versions, Zcash inclusion evidence, inline discussion and accountable moderation. The Proposals module is independent of DAO membership, treasuries and ballots.

The user confirmed:

- **1 Zcred = US$ 0.25** as the purchase price for usage credits.
- **Submitting a new proposal costs 20 Zcred = US$ 5.00**.
- Buy credits with ZEC from the user's own wallet; issue credits after a confirmed receiving payment.
- Preserve the committee/DAO separation. Committee proposals use the committee's own credit scope.

These are product prices, not Zcash network fees, a withdrawal right, or an official ZCG application fee. Existing demo credits have no cash value. This decision does not retroactively price demo balances, move balances, change comment/like costs or activate purchases.

## What makes the product useful

| Need | Product behavior | Evidence of completion |
| --- | --- | --- |
| One place to understand a proposal | Exact submitted body, USD budget, milestones, attachments, source links and revision history | A new applicant can prepare and read the complete application without assembling fragments from different sites. |
| Recover what was actually submitted | Immutable downloadable versions and a visible comparison between revisions | An older package remains available and matches its recorded fingerprint after a revision. |
| Verify the record independently | Zcash commitment plus a downloadable receipt, network, block, observed time and verifier | A separate reader recovers the expected memo and verifies canonical inclusion against the exact downloaded revision. |
| Keep the existing community process | Original GitHub issue and forum thread, dated source status and exportable submission text | The user can continue through the official process and distinguish platform publication from committee intake. |
| Discuss without losing context | Inline comments, replies, disclosed participation costs and retained moderation history | Discussion stays attached to the record and cannot change published committee votes or rewrite an anchored revision. |
| Resist low-effort submission spam | A disclosed 20-Zcred submission price and server-enforced limits | Duplicate requests cannot create duplicate records, charges or anchor attempts; payment buys no ranking or governance influence. |

The initial experience should remain compact: **New proposal**, editor/preview, fee review, publication progress, then the proposal card. Details about files, provenance and verification stay behind expandable controls.

## Relationship with ZCG, GitHub and the forum

The [official ZCG grant process](https://zcashcommunitygrants.org/selection/), checked on 10 October 2026, asks applicants to submit a GitHub application and post its link on the forum. Eligibility screening precedes community and committee review.

Publishing in this application must therefore have its own status. It does not claim that ZCG received, reviewed, endorsed or approved the request. **Under review** requires source evidence or an authorized committee action, rather than successful payment alone.

Preserve the GitHub issue number, forum URL, source revision/update time and the time of the last check. Show externally imported text, externally reported decisions and local discussion with their own provenance. Preserve the author's outgoing text for export; automatic posting to GitHub or the forum is a separate, explicitly authorized integration.

The current 20 review applications are dated metadata snapshots, and the five historical decisions are editorial summaries. They demonstrate browsing and discussion, not complete native submission or full preservation of every external attachment.

## Price and payment rules

Store money as integer USD cents: **25 cents per Zcred; 500 cents per initial submission; 20 integer credits charged**. The server owns the price and policy version. The confirmation screen must show all three before the author commits.

The USD-to-ZEC conversion happens when purchasing credits. An invoice freezes the credit quantity, USD price, ZEC/USD source and observation time, quote expiry, exact zatoshi amount, receiving scope and payment reference. Confirming that payment issues the quoted credit quantity exactly once. A later exchange-rate change does not change the cost of submitting with credits already purchased.

The present fixed-ZEC package configuration does not implement this USD purchase policy. It must be migrated deliberately, while existing invoices retain their original amount and receiver. A grant's USD budget and payment-day settlement quote remain a separate flow.

Rules for the first publication:

- Saving and editing a private draft is free. Opening a preview, importing a public historical record or viewing a proposal does not charge an author.
- Charge the authenticated permanent account in the selected publication scope. Never fall back to a DAO balance for a committee submission.
- Bind the submission request to the exact body, files, price version and stable request key. Reject a stale price or changed payload before charging.
- The 20-Zcred price covers the intended initial publication and anchoring service. Do not add an undisclosed ZEC fee in the submit step; an unavailable or over-budget chain service leaves publication pending or unavailable.
- Payment buys publication service, not committee approval, a ballot, a grant award or additional prominence.
- A new published revision must preserve earlier versions. Its price is not yet decided; do not silently charge another 20 Zcred or promise unlimited paid anchoring.

Recommended settlement design, to implement and validate before paid activation: reserve 20 Zcred after validation, then capture once when the promised publication and anchor are verified. Release a reservation only when cancellation or definitive failure is safe. A timeout after wallet dispatch is an unknown outcome to reconcile, never grounds for an automatic resend or refund. Committee rejection after successful publication is separate from service failure. Refund authority and the support deadline still require an operating policy.

## Author submission and chain evidence

The next native submission must preserve the author's complete intended public text and supported attachments. A new native manifest type must be distinguishable from an imported historical summary or review snapshot. The author reviews the exact public package before any immutable commitment.

Only the revision's cryptographic commitment goes into the Zcash memo; downloadable proposal files require durable storage and a separately restorable backup. An anchor does not store the whole proposal, certify its assertions or prove the legal identity of its author.

Keep these state dimensions separate:

| Dimension | Examples |
| --- | --- |
| Publication | Draft, submitted, published, moderated/withdrawn |
| Credits | Available, reserved, captured, released; audited corrections |
| Anchor | Queued, dispatching, submitted, unknown, unbroadcast, confirming, verified at check, failed/reorg |
| External review | Not submitted externally, source-linked, eligibility screening, under review, approved, rejected, abandoned |

Persist the immutable package and durable anchor intent before any wallet call. The web process does not receive spending keys. A worker reconciles the operation and checks actual broadcast, matching memo, network, canonical block and confirmation depth. Only validated evidence earns **Anchored on Zcash**. A transaction ID or a successful file hash check is insufficient.

Display source publication time, application capture time and observed block time separately. Anchoring a historical application today does not prove that this application preserved it on its original submission date.

The public archive uses a dedicated account and independently usable reader. Do not publish a personal or funding-wallet viewing key. Mainnet and testnet receipts remain visibly distinct.

## Positioning and the “first” claim

Use the intended positioning: **A proposal workspace with independently verifiable records anchored on Zcash.** Before live evidence, say that anchoring is in the pilot stage.

The ambition to be the first proposal system with this complete workflow is recorded, but is not a verified market fact. [ZOpenTimestamps](https://github.com/AbdelStark/zopentimestamps) describes Zcash-based timestamping, and [CompZ](https://github.com/Compliledger/CompZ) describes document-hash anchoring and verification. These are relevant prior approaches; their descriptions do not establish a competing end-to-end grant platform or validate their production claims.

Do not publish “first” until a documented prior-art review defines the category and launch date, and a native proposal has a publicly reproducible mainnet receipt. Prioritize the demonstrated workflow over a superlative.

## Delivery sequence and acceptance

1. **Native intake and preview economics.** Add the account-owned editor, full revision package, source fields, versioned 20-Zcred quote and local submission lifecycle. Keep demo credits explicitly separate from purchased units. Verify draft privacy, scope ownership, stale prices, insufficient credit, changed payloads, concurrent spending and replay recovery.
2. **Complete the real anchor pilot.** Use the dedicated funded account and separate reader to anchor the agreed five records. Reproduce memo recovery and canonical inclusion. Include one new authored proposal; historical imports alone do not demonstrate native intake.
3. **USD-priced credit purchases.** Replace new fixed-ZEC offers with the confirmed USD price and expiring quotes; retain existing invoices. Complete receiver history, exception resolution and one real payment-to-credit-to-publication trace with final balances and receipts.
4. **Operational publication.** Add monitored anchor processing, reservation/capture/release recovery, retained files, fee limits and clear pending/failure UI. Demonstrate process restarts, unknown outcomes, reorganization and independent download verification before paid production.
5. **Interoperability.** Add template export and linked external updates with provenance. Any two-way publishing integration requires explicit destination authorization and duplicate protection.

This document records requirements and priorities. It does not activate a receiver, collect a fee, submit a proposal to ZCG or broadcast an anchor.
