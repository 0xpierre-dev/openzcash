# Email-first account access

Email-code authentication and optional passkeys are included. Operators configure and verify delivery on their own final origin. See [public access](participate-public-access.md).

## Product behavior

- Proposals remain public. Signing in opens inline, without leaving the proposal.
- The first access method is a six-digit email code. A first successful verification creates a regular user; returning users keep their profile, balances and permissions.
- There are no password fields. The legacy password login/signup endpoints return HTTP 410 and cannot create sessions. Existing hashes are retained for migration integrity; they are not an access method. One-time voting invitation links keep their separate scoped flow.
- Users can optionally add a passkey after verifying their own email. A five-minute, one-use authorization from a fresh email sign-in allows first-key enrollment without a redundant code, from the setup offer or My profile → Passkeys. Additional keys and removals require a fresh email code bound to that action. Email remains available for recovery. See [passkey security boundaries](passkeys.md).
- Supported browsers show “Continue with passkey” even without prior site storage, so synchronized keys remain usable. Device authentication starts only after an explicit click. The native Participate page and its proxied APIs stay on the configured portal origin; cross-origin or embedded ceremonies remain rejected.
- The local demo signs into the existing `preview_participant` profile. Display name, avatar and discussion privacy remain editable. Passkeys are disabled for demo accounts, including direct API requests.
- Demo Zcred have no monetary value and require no deposit. The existing one-time 25-credit allowance and ledger remain intact; spent balances are not reset. Payment controls are hidden in the sandbox. Planned paid credit pricing is unchanged for a later release.

## Deployment configuration

1. Apply `prisma/upgrades/20261010_email_auth.sql` and run `prisma generate` before rolling out the application. This is an additive migration.
2. Verify the sender domain in Resend and configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` using the server secret store.
3. Generate separate random `EMAIL_AUTH_SECRET` and `ZCAP_SESSION_SECRET` values of at least 32 characters. Do not place them in browser variables or commit them.
4. Set the canonical HTTPS `APP_BASE_URL`; set `PASSKEY_ORIGIN` to the same public origin (`https://openzcash.org` for native Participate). Do not derive either from user-controlled proxy headers.
5. Keep passkey enrollment in the top-level native page and preserve its Origin and host-only cookies through the same-origin API proxy. Test real browser cookie policies before deployment.
6. Send and receive an actual email with a controlled account, then verify code expiry, resend, replay rejection, session logout and optional passkey enrollment before marking delivery ready.

Until those settings exist, the email request endpoint fails closed with `EMAIL_NOT_CONFIGURED`. The UI explicitly says email sign-in is coming soon, and the local demo remains usable. No fixed code, fake “sent” response, logged code or API code-return fallback exists.

## Security properties

- A random 256-bit HttpOnly browser cookie binds each challenge to its requesting browser. Login and passkey-management cookies are separate; both are Secure in production, SameSite=Strict, host-only, and expire after ten minutes.
- Six-digit codes use a cryptographic random generator. Only a keyed HMAC is stored. The code is sent in the email body, never in its subject, application logs, JSON responses or browser storage.
- Verification is serialized in PostgreSQL and consumes proof once. Five incorrect attempts disable the challenge; unsuccessful attempts commit rather than roll back.
- Origin, purpose, account and exact passkey action are checked. Resending invalidates the prior challenge from that browser. Delivery failure leaves no usable challenge.
- Request caps are shared across instances: one code per recipient per minute, five per ten minutes, and 200 per ten minutes globally. Recipient throttle identifiers use keyed hashes; no IP addresses are retained. Add trusted-edge abuse protection before public traffic.
- Throttled responses include the actual remaining `retryAfter` seconds and matching `Retry-After` header. Sign-in and management codes remain purpose-separated; a previous sign-in code cannot confirm passkey management. First-key setup instead consumes the dedicated session-bound authorization issued after a successful sign-in.
- Email input is normalized by trimming/lowercasing, not provider-specific aliases. Case-colliding legacy accounts fail closed instead of being merged. Disabled/demo accounts cannot gain email access.
- Expired challenge rows are removed on new requests. Throttle windows expire after ten minutes. A maintenance job should also purge expired rows for low-traffic deployments.
- Email proves access to an inbox. It is not a shielded wallet signature, committee membership, voting entitlement or multiple-factor authentication. New accounts get USER access only.
- Demo access requires nonproduction mode, `WORKSPACE_PREVIEW=true` and the explicitly allowed loopback preview database. It cannot be enabled on production by setting a preview flag alone.

## Validation

Automated tests cover HTTP origin checks, private responses/cookies, bounded bodies, no session before verification, missing sender, code attempts/expiry/replay, concurrent consumption, account collisions, scope binding, shared demo isolation and signed WebAuthn responses. Delivery is mocked only inside tests. Browser acceptance covers the embedded demo, profile editing, credits, password-free sign-in, light/dark presentation and responsive layout.

References: [Resend email API](https://resend.com/docs/api-reference/emails/send-email), [OWASP token and code guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

### OpenZcash email identity

The login, passkey-add and passkey-remove messages use `lib/email/participate-code.ts`: the OpenZcash mark and wordmark, gold/ink/warm-white palette, a prominent selectable code, dark-mode styles and a narrow-screen layout. The text version carries the same action, expiry and browser instructions. Essential content stays readable when images or style blocks are disabled. The logo uses the existing public OpenZcash PNG; no per-recipient tracking URL is added.
