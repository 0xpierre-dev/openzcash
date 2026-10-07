import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { handleRequest } from "./handler.mjs";

const fallbackHtml = await readFile(
  new URL("../../public/service-unavailable.html", import.meta.url),
  "utf8",
);

function documentRequest(path = "/zec-observatory", options = {}) {
  const headers = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    ...options.headers,
  };
  return new Request(`https://openzcash.example${path}`, { ...options, headers });
}

for (const status of [500, 502, 503, 504]) {
  test(`replaces a document ${status} with the bundled page and safe headers`, async () => {
    const origin = new Response("Internal diagnostics must stay private", {
      status,
      headers: { "content-type": "application/json", "set-cookie": "internal=secret" },
    });
    const response = await handleRequest(documentRequest(), {
      fallbackHtml,
      fetchOrigin: async () => origin,
    });
    assert.equal(response.status, 503);
    assert.equal(await response.text(), fallbackHtml);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("retry-after"), "30");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(response.headers.get("content-security-policy"), /script-src 'none'/);
    assert.match(response.headers.get("content-security-policy"), /style-src 'unsafe-inline'/);
    assert.match(response.headers.get("content-security-policy"), /img-src data:/);
  });
}

test("HEAD has the fallback headers and no body", async () => {
  const response = await handleRequest(documentRequest("/", { method: "HEAD" }), {
    fallbackHtml,
    fetchOrigin: async () => new Response(null, { status: 502 }),
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(await response.text(), "");
});

const bypasses = [
  ["API root", "/api"],
  ["API route", "/api/health"],
  ["encoded API route", "/%61pi/private"],
  ["Next root", "/_next"],
  ["Next asset", "/_next/static/chunk.js"],
  ["public asset", "/logos/zcash.svg"],
  ["encoded public asset", "/logo%2Epng"],
  ["dotted route", "/.well-known/resource"],
  ["malformed escape", "/bad%zzpath"],
  ["RSC query", "/projects?_rsc=payload"],
  ["RSC header", "/projects", { headers: { rsc: "1" } }],
  ["router state", "/projects", { headers: { "next-router-state-tree": "state" } }],
  ["router prefetch", "/projects", { headers: { "next-router-prefetch": "1" } }],
  ["segment prefetch", "/projects", { headers: { "next-router-segment-prefetch": "segment" } }],
  ["server action", "/projects", { headers: { "next-action": "action" } }],
  ["JSON client", "/projects", { headers: { accept: "application/json" } }],
  ["wildcard client", "/projects", { headers: { accept: "*/*" } }],
  ["HTML rejected", "/projects", { headers: { accept: "text/html;q=0, */*" } }],
  ["empty destination fetch", "/projects", { headers: { "sec-fetch-dest": "" } }],
  ["image destination", "/projects", { headers: { "sec-fetch-dest": "image" } }],
  ["CORS fetch", "/projects", { headers: { "sec-fetch-mode": "cors" } }],
  ["upgrade", "/projects", { headers: { upgrade: "websocket" } }],
  ["POST", "/projects", { method: "POST", body: "private payload" }],
  ["PUT", "/projects", { method: "PUT", body: "private payload" }],
];

for (const [name, path, options] of bypasses) {
  test(`preserves the original failing response for ${name}`, async () => {
    const request = documentRequest(path, options);
    const bytes = new Uint8Array([0, 255, 65, 13, 10]);
    const origin = new Response(bytes, {
      status: 502,
      headers: { "content-type": "application/octet-stream", "x-origin": "unchanged" },
    });
    const response = await handleRequest(request, {
      fallbackHtml,
      fetchOrigin: async (received) => {
        assert.equal(received, request);
        return origin;
      },
    });
    assert.equal(response, origin);
    assert.equal(response.bodyUsed, false);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
    assert.equal(response.headers.get("x-origin"), "unchanged");
  });
}

for (const status of [200, 201, 206, 301, 302, 303, 307, 308, 400, 401, 403, 404, 429, 501, 505]) {
  test(`preserves document status ${status}, headers, and unconsumed body`, async () => {
    const origin = new Response("origin bytes\u0000é", {
      status,
      headers: { location: "/login?returnTo=%2Fprojects", "set-cookie": "session=example" },
    });
    const response = await handleRequest(documentRequest(), {
      fallbackHtml,
      fetchOrigin: async () => origin,
    });
    assert.equal(response, origin);
    assert.equal(response.bodyUsed, false);
    assert.equal(await response.text(), "origin bytes\u0000é");
  });
}

test("HTML clients without fetch metadata can receive the fallback", async () => {
  const request = new Request("https://openzcash.example/", {
    headers: { accept: "text/html; q=0.8" },
  });
  const response = await handleRequest(request, {
    fallbackHtml,
    fetchOrigin: async () => new Response("Unavailable", { status: 502 }),
  });
  assert.equal(response.status, 503);
});

test("a network exception produces HTML for navigation without disclosing details", async () => {
  const response = await handleRequest(documentRequest("/?token=private"), {
    fallbackHtml,
    fetchOrigin: async () => { throw new Error("secret hostname and credentials"); },
  });
  assert.equal(response.status, 503);
  assert.equal(await response.text(), fallbackHtml);
});

test("a failed POST is not retried and receives a generic machine-readable 502", async () => {
  const request = documentRequest("/api/action?token=private", {
    method: "POST",
    body: "private payload",
  });
  let calls = 0;
  const response = await handleRequest(request, {
    fallbackHtml,
    fetchOrigin: async (received) => {
      calls += 1;
      assert.equal(await received.text(), "private payload");
      throw new Error("private upstream error");
    },
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "bad_gateway",
    message: "The upstream service is temporarily unavailable.",
  });
});

test("a failed API HEAD returns no JSON body", async () => {
  const response = await handleRequest(documentRequest("/api", { method: "HEAD" }), {
    fallbackHtml,
    fetchOrigin: async () => { throw new Error("private details"); },
  });
  assert.equal(response.status, 502);
  assert.equal(await response.text(), "");
});

test("successful streaming responses pass through without buffering", async () => {
  let controller;
  const stream = new ReadableStream({ start(value) { controller = value; } });
  const origin = new Response(stream);
  const response = await handleRequest(documentRequest(), {
    fallbackHtml,
    fetchOrigin: async () => origin,
  });
  assert.equal(response, origin);
  assert.equal(response.body, stream);
  controller.enqueue(new Uint8Array([1, 2, 255]));
  controller.close();
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 255]));
});

test("the bundled fallback works without scripts or external assets", () => {
  assert.match(fallbackHtml, /OpenZcash/);
  assert.doesNotMatch(fallbackHtml, /<script\b|<link\b|\son\w+\s*=/i);
  assert.doesNotMatch(fallbackHtml, /(?:src|srcset)=["'](?!data:)/i);
  assert.doesNotMatch(fallbackHtml, /url\(\s*["']?(?!data:)[^)]/i);
});
