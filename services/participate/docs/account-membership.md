# Account-based DAO membership

9 October 2026 · Local implementation · R06, R08, R12, R21, R41, R47

Signal integration is deferred. The primary membership flow uses an authenticated Z Voice account, with the existing passkey or password sign-in. Registering a passkey proves access to that account; it does not prove a unique person, a ZcashName, ownership of ZEC, or DAO membership. Account creation and passkey enrollment retain their existing flows.

## Available flow

1. A visitor opens **Membership** or `/communities/[communityId]/join`. Public communities keep inline sign-in and do not expose the private roster or applicant list. Communities without published proposals accept requests only from their current leaders; an owner can start with their own account.
2. A signed-in person explicitly requests admission. The server takes the account ID from the session, never a supplied nickname or user ID. Leaders can see pending requests in **Members → Requests**. Applicants can see their own status on the membership page.
3. A current owner or manager selects a pending request under **Propose change**. The resulting draft binds the exact account and request. A request or draft grants no membership, ballot entitlement, or administrator role. Leaders can decline an unproposed request without changing any roster.
4. The owner can initialize an entirely empty roster once, selecting their own account and consenting applicants. A previously populated or all-removed roster cannot be reset. Managers cannot perform this setup.
5. Later changes remain vote-governed. Execution requires a passing FINALIZED result. CLOSED does not apply membership. The production finalizer remains unavailable pending complete cutoff and collection evidence; this delivery does not enable an override.

An applicant can withdraw a pending or proposed request. Withdrawal or a disabled applicant account prevents admission even if the associated ballot passes. A new attempt is a new record; the user can reapply 24 hours after a closed request. Requests are also bounded to ten new attempts per account per hour. This is account-based abuse resistance, not Sybil resistance.

## Identity and voting boundaries

- New membership records have an explicit `DaoMember.userId`. Community/account uniqueness prevents duplicate membership for the same account. Matching a nickname, display name or Signal alias never links an existing identity.
- Existing Signal records stay readable as **Legacy invitation**. Existing rounds and invitation sessions are unchanged. An identity collision requires a separate verified migration; no automatic bridge exists.
- Both proposal builders snapshot account members into `PollEligibility`. An account-linked member receives one account entitlement and no temporary invitation, even if the record retains a Signal alias. Unlinked legacy rows retain their existing invitation path. Disabled accounts are excluded from new snapshots.
- Removing a voting member preserves the platform account, passkeys, administrative roles and already frozen rounds. Membership alone does not grant access to older private discussions or credits; their existing per-proposal authorization remains in force.
- The member role is distinct from OWNER/MANAGER. Member navigation keeps the community workspace; eligible users reach the existing ballot through **Open ballot**. The ballot's visual migration is separate work.
- `MEMBERSHIP_ACCOUNT_V1` commits the community, action, stable account/request or removal target, target label, UTC dates, options and current decision rules. Anchor preparation and execution validate that commitment. This does not yet commit the entire eligibility manifest or prove chain finalization.

## Reliability and privacy

Mutations recheck current account and DAO authority in serializable transactions. Request IDs and draft request keys make retries return the original object; altered draft payloads cannot reuse a key. One request can produce only one proposal. A partial database index additionally prevents simultaneous open requests for the same community/account. Same-origin write checks reject cross-site submissions.

The applicant sees only their own request; current leaders see the queue. Public proposal metadata contains the action type and state without account IDs or private identity fields. A proposer can still write identifying text in a public title or body. No global account search, contact export, Signal delivery or email is introduced.

The interface preserves input on errors, blocks overlapping submissions, confirms withdrawals/declines, and treats lost or malformed save responses as uncertain. Persistent request status replaces the need for Signal in this onboarding flow; it is not an unread notification inbox or push delivery.

## Migration and remaining work

Apply `20261009_account_membership.sql` once to existing databases, followed by `20261009_membership_commitment.sql` after the USD budget migration. Regenerate Prisma and restart the app. No historical row is automatically attached to an account. Fresh Prisma schemas also need the SQL commitment checks; the service's serializable transactions enforce the open-request invariant independently of the additional partial index.

For rollback, stop new membership writes and preserve the new records and commitment version; do not drop account links or rewrite requests back into Signal aliases. The previous app cannot safely operate on account-only members. Back up before applying migrations and prefer a forward repair.

Remaining gates: verified finalization; configurable Leader-managed/Vote-governed policy and policy-switch authority; complete membership event history; verified migration of legacy identities; ZcashNames proof of control; notification inbox; and the modern ballot/operations interface. No production deployment, invitation delivery, real wallet transaction or hardware passkey enrollment is part of this increment.
