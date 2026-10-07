# Optional edge error fallback — not active

This package is prepared code only. It is not deployed and does not protect the
production domain yet. As checked on October 7, 2026, `openzcash.org` uses Hostinger
nameservers (`dns-parking.com`) and points directly to Railway. No Cloudflare zone,
credentials, proxy, or route is assumed. The example config has no account,
domain, or route, and disables both `workers.dev` and preview URLs.

The Railway 502 observed in this incident comes from its edge proxy when it cannot
reach the application. Next.js error boundaries cannot replace it. Serving
`public/service-unavailable.html` from the same application also cannot replace
it during a full origin outage. This adapter imports that self-contained page into
an independent edge deployment, so displaying it would not require another fetch
to Railway.

## Behavior

- Only document GET/HEAD requests accepting `text/html` can receive the fallback.
  If browser fetch metadata is present, it must identify navigation to a document
  or frame. API paths (`/api` and children), Next paths (`/_next` and children),
  dotted paths/files, RSC requests, prefetch headers, action headers, and `_rsc`
  queries pass through. Path checks also handle percent-encoded characters.
- Document responses with status 500, 502, 503, or 504 become the branded page with
  status 503, `Cache-Control: no-store`, `Retry-After: 30`, `nosniff`, and a CSP that
  permits inline CSS and data images but forbids scripts and external resources.
  The request classification, not the origin's error MIME type, determines this:
  Railway can return JSON or HTML for an unavailable application.
- Every other origin response is returned unchanged, without reading its body.
  This includes successful streaming responses, redirects, APIs, RSC, assets, and
  POST responses. The adapter forwards the original request and preserves its URL
  and Host. Redirects are not followed by the proxy.
- A network exception returns the branded 503 for document navigation and a
  generic JSON 502 for other requests. HEAD responses have no body. Exception
  details, URLs, query strings, request bodies, and credentials are never logged
  or copied into these responses.
- There is no extra origin timeout, retry, cache, or background health polling.
  The underlying network timeout still applies. An error after response streaming
  has started cannot be replaced, nor can this code cover a failure of the edge
  provider itself, client DNS, or client TLS.

## Local verification

From the repository root, use Node.js 20.9 or later:

```sh
node --test ops/error-fallback/handler.test.mjs
```

The tests load the actual fallback HTML and inject origin responses/exceptions.
They exercise document failures, preserved binary/streaming responses, redirects,
API/RSC/asset exclusions, POST handling, and private-data suppression. They do not
contact production, deploy anything, or test Cloudflare routing.

For a future Wrangler bundling check, with an independently installed Wrangler v4:

```sh
wrangler deploy --dry-run --config ops/error-fallback/wrangler.example.json --outdir /tmp/openzcash-error-fallback-build
```

This imports the HTML as a Text module. A dry run only checks bundling; it does not
prove an active route or origin-outage coverage. Do not run a normal deployment
from this example as a substitute for the activation review below.

## Activation requirements

1. Review the current DNS records and provider setup. An actual Cloudflare Route
   requires an active Cloudflare zone and a proxied record pointing to the correct
   Railway origin. The current Hostinger setup does not provide that. Preserve
   unrelated records, mail, DNSSEC, origin routing, and certificate behavior in
   any separately reviewed migration. This package changes none of them.
2. Confirm the intended Cloudflare account, applicable plan/limits, origin TLS,
   and exact hostname scope. Use a **Route in front of the existing Railway
   origin**, not a Worker Custom Domain that becomes the origin. Do not add an
   arbitrary alternate origin URL; `fetch(request)` preserves the real host and
   follows the zone's configured origin without route recursion.
3. First deploy to a separate test hostname with a controllable mock origin.
   Verify successful pages, login redirects/cookies, API and RSC responses, assets,
   POST bodies, deliberate origin 500/502/503/504 responses, and connection failure.
   Confirm status 503, no caching, correct CSP, mobile/desktop rendering, and
   retry navigation. Do not stop production to manufacture an outage.
4. Review and enable only the intended production route after those checks.
   Keep route removal as the rollback to direct origin behavior. Re-import and
   redeploy the Worker when the shared HTML changes; it is bundled at build time.
5. Record activation separately from the app deployment. Until DNS/proxy/routing
   and an independent-origin failure test are verified, report this as prepared
   but inactive.

Cloudflare's paid Custom Error Rules are an alternative to this Worker; they can
store a page asset independently and match error responses. They also require
proxied DNS and configuration. Installing this package enables neither option.

## References

- [Railway: Application Failed to Respond](https://docs.railway.com/networking/troubleshooting/application-failed-to-respond)
- [Railway: Healthchecks](https://docs.railway.com/deployments/healthchecks) — checks run at deployment activation, not continuously.
- [Cloudflare: Worker Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [Cloudflare: Request redirect handling](https://developers.cloudflare.com/workers/runtime-apis/request/)
- [Cloudflare: Wrangler Text-module bundling](https://developers.cloudflare.com/workers/wrangler/configuration/#bundling)
- [Cloudflare: Custom Errors](https://developers.cloudflare.com/rules/custom-errors/)
