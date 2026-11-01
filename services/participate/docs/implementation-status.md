# Implementation scope and remaining work

November 2026 source distribution. This is a code-level scope guide, not a
certificate for a hosted instance. Read the repository release audit separately
for the checks executed on this candidate.

| Area | Included | Remaining operational or product boundary |
| --- | --- | --- |
| Public Participate | Proposal board, official-source capture, immutable revisions, discussion, recovery downloads and proofs | Import your own records; configure the source worker and storage. Historical samples are not a live database. |
| Accounts | Email codes, sessions, optional passkeys, private profile and notifications | Configure a verified sender and final HTTPS origin; exercise delivery and physical-device enrollment there. |
| Credits and submissions | Append-only Zcred ledger, free pilot, drafts, native pilot publication and author withdrawal | Real purchase activation and production submission fee reservation/capture require separate payment and failure/refund acceptance. |
| Committee | Scoped roles, invitations, public signed rationale, immutable review rules and receipts | Disabled by default. Requires authorized owners, actual membership and personal keys. Existing proposal anchors do not anchor later decision receipts. |
| Chain automation | Durable source/activity queues, bounded signer transport, independent reader and downloadable verifiers | Supply an isolated operator wallet/reader and its policy; wallet binaries, credentials, live journals and monitoring are not bundled. Never put spend authority in the public web process. |
| DAO pilot | Scoped workspace, membership requests, recorded treasuries, ballot collection and closure guards | Verified finalization, configurable membership policy, ZcashNames control and full payment lifecycle remain incomplete. Do not present this as binding governance. |

A published source snapshot does not provision an email account, committee,
wallet, production data or deployment. Public source approval is distinct from
approval to enable the disabled financial or governance features.

See [Privacy model](privacy-model.md), [Threat model](threat-model.md),
[Database setup](database.md), [Deployment](deployment.md),
[Committee operations](committee-operations.md) and [Voting finalization](voting-finalization.md).
