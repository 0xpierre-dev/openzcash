# Complete ZCG source intake

Updated 13 October 2026. This document covers the older manual capture and recovery tools. Production uses the [automatic discovery and Ironwood queue](participate-automation.md) on the operator host, with durable records in Railway. The automatic importer accepts complete grant forms with custom titles before labels are assigned; manual V1 capture below retains its stricter legacy review-label validation.

## Public behavior

1. Choose a real new application in the official ZCG tracker. Capture its exact Markdown, author handle, dates and original label names/colors. Intake accepts only an open Grant Application explicitly Ready For ZCG Review, without a terminal decision, milestone or payment label.
2. Review the two recovered files (`proposal.md`, `source.json`), source URL, capture date and manifest hash. The body is preserved byte for byte, including Markdown formatting. Arbitrary numbers in prose are never guessed into a budget. Linked images, PDFs and forum pages remain links; archive them as a separately reviewed extension if full attachment preservation is required.
3. Import into the configured host/committee. The card appears in Under review, with the source capture date. It is a dated observation of the official process, not a decision by the pilot. A repeated import returns the same immutable revision; changed bytes require a new revision linked to the previous hash. An old editorial record with the same source URL cannot be duplicated under a new ID.
4. Export only the chosen record and prepare an anchor. At this stage the file is available, but no transaction has been sent. Under review and Anchored are independent states.
5. The operator checks the exact root/memo, receiver, network, fee and frozen export, then publishes through the separate Zallet signing process. No public HTTP endpoint can trigger that spend. Preserve the transaction ID and reconcile an uncertain submission before any retry.
6. An independent read-only wallet and Zebra verify the exact memo/recipient, canonical block and at least ten mainnet confirmations. Only then does the dated receipt provide confirmed-chain evidence. Download the package/receipt and recover it using the standalone verifier outside the website. Keep two independent copies of the files: a hash in Zcash does not contain their content.

Native proposals submitted by public testers remain **Published in demo**. Their later anchor proves the same files existed by the block timestamp; it does not promote them to an official ZCG application, or claim they were submitted at that timestamp.

## Commands

Run from the backend checkout with its private operator configuration. Placeholder paths/numbers must be replaced with the selected application and reviewed artifacts. The output directory must not already exist.

```sh
node --import tsx scripts/intake-zcg-proposal.ts --issue ISSUE_NUMBER --out /private/path/new-capture
```

This fetches one explicitly selected official issue; it makes no database or wallet changes. Inspect `intake.json` for the expected hash and package filename, then validate without importing:

```sh
node --import tsx scripts/intake-zcg-proposal.ts --package /private/path/new-capture/RECORD-r1.zvoice.json --expect-hash MANIFEST_HASH
```

For import, configure `DATABASE_URL`, `PARTICIPATE_PUBLIC_DEMO=true`, `PARTICIPATE_COMMUNITY_ID` and `PARTICIPATE_DEMO_COMMITTEE_ID` for the intended environment. In production, `APP_BASE_URL` must be the canonical HTTPS origin. The host must be a DAO container and the credit scope a separate COMMITTEE.

```sh
node --env-file=.env.local --import tsx scripts/intake-zcg-proposal.ts --package /private/path/new-capture/RECORD-r1.zvoice.json --expect-hash MANIFEST_HASH --apply
node --env-file=.env.local --import tsx scripts/export-archive-collection.ts HOST_ID /private/path/new-anchor RECORD_ID
```

The optional third export argument selects just this record's latest revision. Do not include the 25 already anchored records in the next batch by default. Copy the reviewed public-reader configuration to the new export and follow the existing [anchoring operator guide](proposal-anchoring-pilot.md) for prepare, separate mainnet signing and independent checks. Temporary local SSH sockets are operator conveniences; they are not production infrastructure or a scheduler.

A later content capture uses `--revision 2 --previous-hash PREVIOUS_MANIFEST_HASH`. It cannot replace the earlier bytes or inherit their chain receipt. This importer is limited to pending applications; if the source has already closed or decided, it stops for operator review rather than inventing an Under review state. Current source annotations and future status updates must remain dated and separate from the preserved capture.

## Acceptance evidence and remaining live step

Unit and disposable-PostgreSQL tests cover byte-exact recovery, modified-file rejection, wrong source identity, absent/terminal review labels, pull-request rejection, future timestamps, immutable replay, linked revisions, dated board metadata, zero credit changes and no fabricated chain anchor. A native test and a captured official application are kept distinct.

The next mainnet acceptance step uses the next selected **real** application and its frozen package. It is intentionally not replaced with a fictitious QA proposal or a transaction sent merely to make the test green. Existing 25-record mainnet evidence remains intact.
