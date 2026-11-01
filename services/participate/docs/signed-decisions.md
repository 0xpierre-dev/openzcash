# Passkey-signed reviews

10 October 2026 · Local implementation · Independent Participate pilot

Participate can collect public, passkey-signed decisions on an exact preserved proposal revision. A coordinator freezes the reviewer roster, registered key fingerprints and decision rules. New committee reviews have no deadline and wait for all five responses. Each reviewer signs one final **Approve**, **Reject** or **Abstain** choice together with a public reason. A downloadable receipt includes the proposal package, round manifest and signed ballots; a standalone verifier checks their contents and recalculates the recorded result. The [committee workspace](committee-operations.md) brings team access, the review queue, rules and audit history together.

This is an application-level review protocol. It neither implements the consensus changes in Daira-Emma Hopwood's draft nor controls treasury spending. Imported ZCG positions remain historical source records. A pilot review cannot overwrite them or claim that those people signed. Existing private DAO ballots, Coinholder voting and Zcred balances are separate.

## Product flow

1. Browse Participate without signing in. Authorized committee members enter **Profile → Committee workspace → Reviews**. Public readers can expand **Read & verify → Signed review** inside a proposal, or use its standalone preserved-record page.
2. Reviewers use their own verified email accounts and add a passkey under **Profile → Passkeys**. Email remains the primary entry flow. The shared demo profile cannot enroll or sign.
3. An active owner/manager of the record's governing workspace opens a review on the latest revision. The form shows all reviewers and their readiness. Opening is blocked until every reviewer has a verified account and at least one active passkey for this site's RP.
4. Committee reviews require exactly five voting members, all five responses and three approvals from the full roster (60%). There is no duration setting or automatic expiry. The user selected publication of the final result only after all five members respond. The official [ZCG process](https://zcashcommunitygrants.org/selection/) confirms the three-of-five approval majority; the pilot's complete-response rule is a product requirement. Existing rounds keep their frozen rules. Separate DAO reviews retain editable quorum, approval and duration settings.
5. A reviewer reads the fixed proposal, rules and public-disclosure notice, selects a choice, writes a public reason of 10–4,000 characters and presses **Sign with passkey**. The choice and exact trimmed reason are signed together. Device verification is required. Cancellation records no ballot; a new ceremony can be requested.
6. Counts remain provisional until the fifth response, even after three approvals or three rejections. The fifth response produces Approved with at least three approvals, otherwise Rejected. Abstentions count as responses, never approvals. Time alone never closes a new committee review. There is no early close or vote editing; existing timed rounds retain their original deadline behavior.
7. Anyone can download the receipt and verifier. Save the round fingerprint independently when the review opens, and the receipt fingerprint when downloading it.

The embedded demo stays within Participate and shows signing as unavailable instead of linking to a separate tab. WebAuthn remains restricted to top-level ceremonies, HTTPS in production and localhost during development; the demo change does not relax signature verification or cross-origin restrictions. No signature or account is fabricated to make a demo look complete.

## Roster and rules

For a **COMMITTEE** workspace, the roster consists of every active owner, coordinator (`MANAGER`) and reviewer in `CommunityMembership`. Moderators manage public discussion and are excluded from the voting denominator. For a **DAO**, the roster consists of every active `DaoMember`, explicitly bound to an account. Public ZCG avatar/name data never creates account authorization. After the operator initializes the first verified personal owner, that owner can invite members and manage their roles in the [committee workspace](committee-operations.md). Invitations require acceptance by the exact verified email recipient.

Unlinked, disabled, unverified or keyless reviewers block opening rather than disappearing from the denominator. New committee rounds require exactly five reviewers; separate DAO rounds support 1–200. Both allow up to ten eligible passkeys per reviewer. Duplicate account/key assignments are rejected. Public labels use the opted-in display name or a round-scoped reviewer label.

After opening, the roster, rule set and allowed key fingerprints cannot change through the application. A later membership removal preserves access to that already-open round, matching existing frozen-ballot behavior. A disabled account or revoked key cannot submit a new ballot. Revocation does not erase a previously recorded signature. A newly enrolled replacement key cannot sign an existing round; lost keys can therefore prevent quorum. A new proposal revision is required for a replacement review. There is one round per revision.

Quorum counts all signed choices, including abstentions. V4 requires all five responses before resolving, with three approvals from the full five-seat roster. V3 retains its earlier three-response quorum, full-roster approval rule and deadline. V1/V2 and separate DAO rounds retain their original Approve + Reject denominator and declared percentage. All comparisons use integer multiplication, not rounded display percentages. Abstentions alone can complete participation but can never pass approval.

## Signature format and verification

The round manifest uses the archive's canonical JSON convention: sorted object keys, preserved array order, safe integers and a trailing LF. Its SHA-256 commits to the proposal manifest hash, revision, record ID, title, origin, RP ID, roster, rules and timing policy. V4 commits to `closesAt: null` and `completion: ALL_RESPONSES`.

Each signing envelope contains its versioned domain, round hash, round-scoped voter ID, choice, random 32-byte nonce, issue time and five-minute expiry (capped at the deadline for timed rounds). Removing the review deadline does not extend a passkey challenge. New committee rounds use V4 and DAO rounds use V2; both require a V2 signing envelope with a public rationale. Historical rounds and receipts remain verifiable without rewriting their signed contents. The WebAuthn challenge is the base64url-encoded SHA-256 of this canonical envelope. The client checks the requested choice, exact reason and round before invoking the device. The server verifies signature, challenge, user presence/verification, origin, RP, account ownership, key eligibility, counter, expiry and single-ballot constraints. Altering or removing a V2 rationale invalidates verification.

The verification ceremony is claimed atomically before checking the signature; failed attempts consume it. A new request replaces the account's previous pending ceremony for that round. Preparation is limited to ten attempts per account per minute. All mutation routes require the exact Origin, a permanent authenticated account and bounded JSON bodies. User and key locks coordinate with revocation. PostgreSQL unique constraints and serializable transactions prevent duplicate ballots. Database triggers reject updates/deletes to rounds, frozen voters and ballots. A privileged database administrator can still disable triggers; they are not a decentralized security boundary.

Receipts omit email, database account IDs, credential IDs, user handles and biometric data. They disclose the signing public key, key fingerprint, choice, public reason in V2 and assertion. Public keys/fingerprints can correlate a key reused across reviews; the UI explicitly requests public signing. Keys and signatures prove key control, not natural-person uniqueness, official ZCG identity or organizational delegation.

The implementation uses the installed SimpleWebAuthn 14 APIs and follows [custom challenge binding](https://simplewebauthn.dev/docs/advanced/server/custom-challenges) and [WebAuthn assertion verification](https://www.w3.org/TR/webauthn-3/#sctn-verifying-assertion).

## Independent verification

Download `decision-<round-id>.json` and `decision-verify.mjs` from the expanded review. With Node.js 22+:

```bash
node decision-verify.mjs decision-<round-id>.json \
  --round-hash <independently-saved-round-hash> \
  --hash <downloaded-receipt-hash>
```

The verifier runs without the app, database, private keys or network. It validates the exact proposal package, round fingerprint, each assertion, membership/key binding, unique reviewers and recorded time windows, and recomputes quorum/approval. It rejects a mismatched pinned receipt hash, including a removed ballot. Keep the receipt and both fingerprints outside the operator's system. The verifier bundles third-party libraries; rebuild it with `node scripts/build-decision-verifier.mjs` after relevant source/dependency changes.

**Proof limits:** `SERVER_RECORDED_BALLOTS` means the verifier checks the included ballots. Without an independently retained final receipt, operator omission of a valid ballot is not cryptographically excluded. Opening authority and real-world member identity depend on the application-managed roster. Issue/record/export times come from the server, not a trusted timestamping service. A malicious origin can misrepresent what is displayed before a WebAuthn prompt; this is not a trusted-display transaction-signing protocol. A downloaded verifier should be reviewed or rebuilt independently for high-assurance use.

These receipts explicitly return `chainStatus: NOT_ANCHORED` and `chain: null`. Existing proposal and activity anchors do not retroactively cover decisions made later. A future separately verified Zcash commitment to the final receipt can add content/timestamp evidence, but not prove completeness or official authority. That publication adapter, distributed receipt witnesses/countersignatures and consensus enforcement remain separate work.

## Local setup and release gates

Back up the database, apply `prisma/upgrades/20261010_signed_decisions.sql` once on a database with the existing archive/passkey schema, regenerate Prisma and restart the service. The migration adds four tables and append-only triggers; it changes no old ballots, credits, archives or Zcash transactions. Fresh schema installations must also install equivalent triggers; `prisma db push` alone does not install them.

The preview backup for this change is `/tmp/participate-before-signed-decisions-20261010.dump`; a readable inventory was saved beside it. The additive migration was applied only to the named disposable test database and local `community_workspace` preview. No production schema or deployment was changed.

Before a real-person pilot: configure the verified email sender, confirm the service's final origin, enroll real personal passkeys, explicitly authorize the intended committee accounts and agree on quorum rules. Demo accounts remain excluded. Confirm the full human device prompt on the deployed origin before enabling binding organizational decisions. Production edge rate limits, recovery, independent security review and roster governance are still required for that release.

## Validation

The test suite exercises real synthetic ES256 signatures; these keys belong to isolated tests, not named committee members. Coverage includes three-choice completion, offline standalone verification, altered files/options/rules/keys, wrong origin/account/record, absent user verification, cross-origin ceremonies, duplicate and concurrent replay, expired/closed requests, revoked keys, disabled accounts, frozen membership, replacement keys, append-only database records, session/CSRF/body-size guards and UI cancellation.

The local UI was checked at desktop and 390px mobile widths in light and dark themes, without horizontal overflow. The new disclosure also rendered inside the OpenZcash iframe at `/zcg/participate`. These checks establish local behavior, not a production deployment or human device enrollment.

## Earlier timed committee format

`PARTICIPATE_DECISION_ROUND_V3` explicitly binds `policy: ZCG_MAJORITY` and `approvalBasis: FULL_ROSTER` to five frozen members, quorum 3 and approval 60%. The verifier rejects any other count or threshold in this format. Three approvals pass at the deadline even when the other two members abstain or have not responded; two approvals plus three abstentions do not pass. Fewer than three responses produces No quorum. Before the deadline all outcomes remain Open. V1/V2 retain their original approve-plus-reject denominator. New V3 signatures reuse the rationale-bearing V2 envelope, which binds the complete round fingerprint.

## Untimed committee update

New reviews use `PARTICIPATE_DECISION_ROUND_V4` with five members, quorum 5, approval 60%, `completion: ALL_RESPONSES` and `closesAt: null`. The tally ignores elapsed time and waits for all five unique member ballots. A response days or months after opening is valid if its own short-lived passkey challenge is valid and the account/key remains eligible. Three early approvals remain provisional. Historical V1–V3 manifests, signatures, hashes and outcomes are unchanged.

Apply `prisma/upgrades/20261010_committee_untimed_reviews.sql` after the existing signed-decision migration, regenerate Prisma and restart the service. It permits null deadlines only for V4 rounds and updates no existing rows. The previous committee-policy duration remains historical data; the current service does not use it and rejects attempts by stale clients to reinstate timed defaults. The Rules view is informational. The downloadable verifier supports all four round formats.
