# ZcashNames membership integration

Reviewed 9 October 2026 · Product direction confirmed; integration not yet implemented

## Confirmed behavior

Members will be discoverable through ZcashNames. Each DAO independently selects **Leader-managed** or **Vote-governed** membership. Authorized leaders act directly in the first mode; the configured voting process authorizes additions and removals in the second. Every change retains its actor, reason, effective time, and policy version. A membership change in one DAO does not change another DAO's roster, delete the person's platform account, or alter an already frozen voting round.

The [account-based membership flow](./account-membership.md) now supports explicit account requests, one-time initial setup and account-targeted membership proposals. Signal integration is deferred; legacy invitations remain readable. This document does not claim a working ZcashNames login or active configurable policy.

## Verified integration references

The [Zingo PC resolver](https://github.com/zingolabs/zingo-pc/blob/dev/src/utils/zns.ts) recognizes `.zcash` and `.zec` aliases, normalizes the bare name, distinguishes missing-name and network errors, and caches by network. Its renderer delegates resolution to the main process, whose client uses `zcashname-sdk`; the [dependency manifest](https://github.com/zingolabs/zingo-pc/blob/dev/package.json) declares `^0.12.0`. These files were read directly during this review. This is a useful reference for resolution UX and adapter behavior, not proof of an authentication integration.

The [ZcashMe ZNS indexer](https://github.com/zcashme/ZNS) documents name resolution, network-specific JSON-RPC endpoints, record signatures and ownership metadata. Its [SDK directory](https://github.com/zcashme/ZNS/tree/master/sdk) provides language-specific clients. Use this provider family as the initial integration target, consistent with the Zingo reference. Pin and validate the dependency and resolver configuration during implementation rather than relying on a moving branch.

[ZcashNames.co](https://github.com/ZCashNames/zcash-name-indexer) is a separate registry with different APIs and proof infrastructure. It must not be used as an automatic fallback for the same textual name. Persist provider and network alongside the canonical name to avoid conflating registries.

## Required separation

1. **Name resolution:** Look up the requested name and display the resolved record. A successful lookup establishes only that a record was returned under the selected resolver's trust model.
2. **Control verification:** Verify a supported challenge or reviewed authentication-provider flow, then link a stable internal account. A returned registry signature alone does not prove that the browser user controls the name. A wallet-address challenge proves only the authority defined by that challenge; it must not be described as broader ownership or spending authority without evidence.
3. **DAO membership:** Add or remove the verified account under that community's selected policy. Membership, administrative roles, comment permissions, and voting eligibility remain separately enforced.

Name transfers and address changes require an explicit re-verification/rebinding process. Never merge accounts or transfer authority merely because a current alias or resolved address matches. Owning multiple names must not multiply one account's votes; names alone are not proof of one unique person.

## Implementation sequence

- First complete verified finalization before membership execution. The [closure-safety guard](./voting-finalization.md) now blocks execution at CLOSED and preserves requests; cutoff-aware collection and the finalizer remain pending. Follow the [delivery roadmap](./roadmap.md).
- Extend the implemented stable member/account references with per-community policy and a complete auditable add/remove event history. Keep existing communities vote-governed until an authorized policy change is recorded. Preserve Signal records; do not infer account identity from a nickname or resolved address.
- Add a provider-specific resolver with normalization, network isolation, validated responses, bounded timeouts, rate limits, and unavailable/not-found states. The provider references above record the earlier inspection, not a fresh compatibility check on this review date.
- Introduce verified identity records through supported control verification and explicit account binding; preserve transfer/rebinding history.
- Connect member onboarding, login/comment authorization, and future voting eligibility to the verified account. New account-based membership uses direct sign-in and frozen account entitlements instead of mandatory Signal delivery.
- Update Members to show a ZcashName, verification state, membership status, and source of admission. Use clear pending states until verification and community admission are both complete.

Before enabling authentication, confirm the maintained provider contract, application registration, callback validation, and account-binding behavior. Earlier provider observations must be revalidated against the current implementation and deployment. No live authentication, payment, private-key handling, or provider registration was performed in this review.

## Acceptance checks

Verify guessed community IDs, removed/revoked managers, duplicate identities, alias case/suffix equivalence within the chosen provider, stale or transferred names, resolver failures, retry safety, policy switching during pending proposals, and preservation of voting snapshots. Confirm that an unverified lookup never creates an authenticated session or a voting entitlement. Review roster visibility separately from ballot privacy; linking a public name must not expose a private choice.
