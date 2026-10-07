const REPLACED_STATUSES = new Set([500, 502, 503, 504]);
const NEXT_REQUEST_HEADERS = [
  "rsc",
  "next-router-state-tree",
  "next-router-prefetch",
  "next-router-segment-prefetch",
  "next-action",
];

const FALLBACK_HEADERS = {
  "Cache-Control": "no-store",
  "Retry-After": "30",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": [
    "default-src 'none'",
    "script-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
};

function acceptsHtml(value) {
  return value.split(",").some((range) => {
    const [type, ...parameters] = range.trim().toLowerCase().split(";");
    if (type.trim() !== "text/html") return false;
    const quality = parameters.find((parameter) => /^\s*q\s*=/.test(parameter));
    if (quality === undefined) return true;
    const weight = Number(quality.split("=")[1].trim());
    return weight > 0 && weight <= 1;
  });
}

/** Conservative navigation detection; never turn an API/RSC/asset into HTML. */
function isHtmlDocument(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const headers = request.headers;
  if (headers.has("upgrade")) return false;
  if (NEXT_REQUEST_HEADERS.some((name) => headers.has(name))) return false;
  if (!acceptsHtml(headers.get("accept") ?? "")) return false;

  const destination = headers.get("sec-fetch-dest");
  if (destination !== null && !["document", "iframe", "frame"].includes(destination)) {
    return false;
  }
  const mode = headers.get("sec-fetch-mode");
  if (mode !== null && mode !== "navigate") return false;

  const url = new URL(request.url);
  if (url.searchParams.has("_rsc")) return false;
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return false;
  }
  if (/^\/(?:api|_next)(?:\/|$)/i.test(pathname)) return false;
  // Public files and dotted paths stay untouched even with a broad browser Accept.
  if (pathname.includes(".")) return false;
  return true;
}

function unavailable(request, html) {
  return new Response(request.method === "HEAD" ? null : html, {
    status: 503,
    headers: { ...FALLBACK_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

function upstreamFailure(request) {
  const body = JSON.stringify({
    error: "bad_gateway",
    message: "The upstream service is temporarily unavailable.",
  });
  return new Response(request.method === "HEAD" ? null : body, {
    status: 502,
    headers: {
      ...FALLBACK_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

/**
 * The origin fetch is injected for offline tests. Pass-through responses are
 * returned as the original object: no buffering, rewriting, caching, or retries.
 */
export async function handleRequest(request, { fetchOrigin, fallbackHtml }) {
  const document = isHtmlDocument(request);
  let response;
  try {
    response = await fetchOrigin(request);
  } catch {
    // Do not expose exception messages, request URLs, credentials, or payloads.
    return document ? unavailable(request, fallbackHtml) : upstreamFailure(request);
  }

  if (document && REPLACED_STATUSES.has(response.status)) {
    // Release a replaced body without waiting for a possibly slow origin stream.
    void response.body?.cancel().catch(() => {});
    return unavailable(request, fallbackHtml);
  }
  return response;
}
