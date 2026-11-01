# Private Chat

An isolated, experimental browser chat using direct invitations, Nym transport,
and in-memory Olm Double Ratchet sessions. The source includes the web app, Nym
worker, protocol implementation, tests, and local assets. Discover, rooms,
presence storage, and the old directory service are not used by this version.

## Local preview

Use Node 24.22.1, then run from this directory:

```sh
npm ci
cp .env.example .env.local
npm run dev -- --hostname 127.0.0.1 --port 3002
```

Open `http://127.0.0.1:3002/private-chat`. Set the portal's
`PRIVATE_CHAT_SERVICE_ORIGIN=http://127.0.0.1:3002` and this app's
`PRIVATE_CHAT_PARENT_ORIGIN=http://127.0.0.1:3000` to embed it in a local portal.
Both applications must run in development mode for HTTP loopback origins.
Without a parent origin the chat can run directly, but embedding is denied.
No database, account, server API key, directory, or wallet is required.

The UI can be reviewed without connecting. Clicking Connect contacts the Nym
network. For a delivery check, use two separate browser sessions, connect both,
exchange a fresh invitation, accept the request, and compare the safety code
through a separate trusted channel. Check delivery in both directions, then
close both sessions. A successful build or network-status response does not
prove message delivery.

## Hosting

Use a separate HTTPS origin. Configure these at build time and runtime:

- `PRIVATE_CHAT_DEPLOYMENT=pilot`
- `NEXT_PUBLIC_PRIVATE_CHAT_PILOT=true`
- `PRIVATE_CHAT_ISOLATED=true`
- `PRIVATE_CHAT_ORIGIN=https://chat.example.org`
- `PRIVATE_CHAT_PARENT_ORIGIN=https://portal.example.org` (optional embedding)
- `NEXT_PUBLIC_PRIVATE_CHAT_GATEWAY_ORIGIN=wss://your-gateway.example.org`
- `NEXT_PUBLIC_PRIVATE_CHAT_GATEWAY_ID` matching the selected gateway identity

```sh
npm run build
npm start -- --hostname 127.0.0.1 --port 3002
```

The gateway identity and origins are public configuration, not secrets. Select
and verify a gateway before building; no OpenZcash gateway credentials or
production configuration are shipped. Next embeds `NEXT_PUBLIC_*` values into
the browser build. Changing them requires rebuilding.

A TLS proxy must preserve the public Host and set the correct forwarded scheme;
keep the application listener private. The app rejects unexpected origins.
The portal needs `PRIVATE_CHAT_SERVICE_ORIGIN=https://chat.example.org`. Use the
same portal origin on both sides. Do not put this app under a portal subpath:
origin isolation is part of its security boundary.

The prebuild hook copies the pinned Nym WASM and worker into
`public/private-chat-nym` and writes their hashes. Do not edit generated assets.
The deployed standalone output also needs `public` and `.next/static` copied
beside its server, as specified by Next's standalone deployment convention.

## Privacy and trust boundaries

- Application identities, ratchet keys, invitations and messages live in memory.
  Reloading or leaving clears the application session; it cannot recover it.
  The Nym SDK has its own encrypted browser storage, initialized with a random
  per-session identifier and passphrase. Do not interpret clearing the app session
  as a guarantee that all browser storage or device traces have been erased.
- Invitation fragments are handled in the browser and removed from the URL.
  Treat a live invitation as sensitive and verify the safety code.
- The parent receives readiness and navigation/theme messages. It cannot read
  chat contents or command a message send through the bridge. Exact origin and
  window checks apply to bridge messages.
- Nym provides the transport; application encryption is separate. HTTPS hosting,
  topology services and the entrance gateway still see connection metadata.
  This is not a claim of complete anonymity or equivalence to Signal.
- Do not add session replay, conversation logs, analytics, or error reports that
  include invitations, fragments, message contents or keys. Browser extensions,
  a compromised device, or modified hosted JavaScript remain outside this model.
- The ratchet library's security properties do not certify this integration.
  Independent cryptographic review, physical-device suspension tests, sustained
  load, and operational monitoring remain requirements for a broader rollout.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Tests cover protocol validation, real crypto-library behavior, replay/tampering,
invitation expiry, delivery state, bridge origin checks, CSP, and UI interactions.
Mock-transport tests are not live Nym delivery tests. Network probes under
`scripts/private-chat-*` are opt-in diagnostics and must use disposable sessions.

MIT; third-party packages and bundled fonts retain their own licenses.
