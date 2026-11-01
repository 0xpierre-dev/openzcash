# Passkey sign-in

12 October 2026 · Native Participate sign-in

The initial account flow uses [email codes](./email-auth.md), with no password entry. Passkeys are optional after email verification and are unavailable for the shared demo. Browsing remains public. Passkeys authenticate an account; they do not verify ZcashNames, grant membership or voting power, or sign Zcash transactions.

Eligible reviewers can also use a registered passkey for [public signed decisions](./signed-decisions.md). That separate, domain-bound ceremony signs the exact proposal revision and choice; a normal login assertion cannot be reused as a decision. Email-first access remains unchanged.

## User flow

1. Sign in with the code sent to your own email. A first-time setup offer can reuse this freshly verified sign-in for five minutes, so there is no second email code for your first passkey.
2. Accept the offer, or open the avatar menu → **My profile** → **Passkeys** → **Add passkey**.
3. Name the key and approve creation on your device. Once the fresh sign-in authorization expires or is used, and for additional passkeys, request and enter a new email confirmation code before creating the key.
4. Choose **Continue with passkey** for later sign-ins. A supported browser offers this option even when its site storage is empty, so synchronized passkeys and keys on another device remain accessible. Email sign-in remains available for recovery.

Removing a key requires a fresh email code tied to that exact key. It revokes future key sign-ins without ending existing sessions. Invitation-only and demo sessions cannot register keys. Production Participate runs directly at `https://openzcash.org/zcg/participate`; enrollment and sign-in stay on that origin. Cross-origin or embedded enrollment remains blocked. No personal passkey is created by automated preview validation.

Device creation is always explicit and optional. Cancelling after registration options are prepared consumes the recent sign-in authorization; retrying requires a fresh management confirmation. The sign-in code cannot be reused as that management code. If a send cooldown applies, the server returns its actual remaining seconds in `retryAfter` and `Retry-After`; reaching the delivery-window cap can require longer than 60 seconds.

## Configuration and database

- Install the pinned `@simplewebauthn/server` and `@simplewebauthn/browser` dependencies and regenerate Prisma.
- Existing databases require `prisma/upgrades/20261009_passkeys.sql` **once**, after the User table exists. It only adds passkey, challenge and throttle tables. Fresh databases generated from the current Prisma schema already include them.
- Set `PASSKEY_ORIGIN=https://openzcash.org` for native Participate. Production may use the matching `APP_BASE_URL` if no override exists; HTTPS and an explicit origin are mandatory. The RP ID is `openzcash.org`, with no cross-domain fallback. The same-origin API proxy must preserve the browser's Origin and host-only cookies.
- In local development, use `http://localhost:4411` and set `PASSKEY_ORIGIN` to that value when the preview binds to `127.0.0.1`. Accessing the UI by IP offers a link to localhost. Keys and login cookies are scoped to the site, so localhost and a production domain do not share passkeys.
- Restart a running development server after regenerating Prisma so its cached client includes the new models.

```bash
npx prisma db execute --file prisma/upgrades/20261009_passkeys.sql --schema prisma/schema.prisma
npx prisma generate
```

## Verification and security boundaries

The implementation follows the [SimpleWebAuthn server flow](https://simplewebauthn.dev/docs/packages/server) and [browser flow](https://simplewebauthn.dev/docs/packages/browser). It requests discoverable credentials, requires user presence/verification, and uses no device attestation. The application stores public keys and counters, never private keys, fingerprints, face data or PINs.

- Five-minute, one-use challenges are persisted server-side and bound to a random HttpOnly, SameSite=Strict browser cookie. Production uses a Secure `__Host-` cookie. A verification attempt atomically consumes its challenge; origin, RP, purpose and registration account must match.
- Registration requires fresh email authorization: the first-key shortcut described below or a separate confirmation code bound to the account and chosen key label. The registration ceremony always binds the chosen label and is invalidated if account email, email verification state or retained credential version changes. A disabled account cannot complete registration or authentication.
- The first-key shortcut uses a five-minute, one-use `EMAIL_ENROLL` authorization created only after successful email-code sign-in. Its random token is held in a Secure, HttpOnly, SameSite=Strict `__Host-participate_passkey_email` cookie; the database stores only its hash, the hash of the exact new session token, current account credential version, origin and RP ID. Each session has a fresh signed random ID. Browser/session/account/origin changes or expiry invalidate the shortcut. Registration consumes the grant atomically and uses a `REGISTER_FIRST` ceremony: the final transaction checks that the account has never had a key for this RP, including revoked keys. Concurrent grants therefore cannot create additional keys without separate email confirmation. The existing challenge table supports this without a schema migration.
- Successful email verification returns `offerPasskeySetup: true` only when that authorization was issued. Account passkey settings expose `canEnrollWithRecentEmail` and `recentEmailExpiresAt`, never the authorization token. Code-free registration accepts only the server-bound cookie proof; a session alone or a client-provided eligibility flag cannot authorize it. Setup failure does not invalidate an otherwise successful email sign-in.
- Authentication verifies the signature, origin, RP, user handle and authenticator counter. A transaction checks current account/key status and atomically advances the counter before issuing the standard account session. Replay or revocation races do not create a session from a stale key.
- Each account can hold ten active passkeys per RP. Email confirmation uses the request/attempt limits documented in [email authentication](./email-auth.md); anonymous challenge creation has a shared 500-per-minute RP cap without storing IP addresses. Configure trusted-edge request limits before public deployment; the shared cap is a resource bound, not per-client abuse prevention.
- All write routes require the exact configured Origin. Credential and management payloads have a 64 KiB JSON limit; responses are private/no-store and do not expose library diagnostics, public-key material or password hashes. Public login options do not enumerate accounts or registered keys.

Tests include signed synthetic ES256 registration/authentication responses against isolated PostgreSQL, concurrent replay, wrong origin/RP/signature/handle, absent user verification, expiry, changed password, disabled accounts, ownership checks, revocation and throttling. Component/API tests cover email access, cancellation, return-to-proposal navigation, invitation restrictions, CSRF and bounded request bodies.

Current email-first validation is documented in [email authentication](./email-auth.md). Earlier passkey-first and password-fallback checks are superseded.

```bash
npm test -- --maxWorkers=2 tests/auth/passkey-policy.test.ts tests/auth/passkey-routes.test.ts tests/components/workspace-auth.test.tsx tests/components/passkey-settings.test.tsx
TREASURY_TEST_DATABASE_URL='postgresql://dao_test@127.0.0.1:55438/community_treasury_tests' npm test -- tests/integration/passkeys-postgres.test.ts tests/integration/passkey-enrollment-postgres.test.ts tests/integration/email-auth-postgres.test.ts
```

The integration suite only accepts the isolated loopback test database and retains uniquely named test records. Synthetic credentials are not a real user's device enrollment. Actual Touch ID/Face ID/PIN confirmation must be completed by the user in a supported browser. This local work does not establish a production deployment or complete the separate voting-finalization work.
