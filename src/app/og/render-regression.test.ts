import { execFile } from "node:child_process";
import { describe, expect, it } from "vitest";

// A synchronous Satori loop also blocks an in-process test timeout. Keep the
// real GET handler in a child that its parent can kill without its cooperation.
const CHILD_TIMEOUT_MS = 10_000;
const renderCards = String.raw`
  import assert from "node:assert/strict";
  import { readFileSync } from "node:fs";
  import React from "react";

  globalThis.React = React;
  const mode = process.argv[1];
  assert.ok(mode === "complete" || mode === "fallback");
  const font = readFileSync(
    "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
  );
  const fontRequests = [];
  // Never reach a CDN or another public service. Exercise the real asset loader
  // with a bundled font, including its supported fallback on font-fetch failure.
  globalThis.fetch = async (input) => {
    const url = String(input);
    assert.ok(url.startsWith("https://cdn.jsdelivr.net/npm/@fontsource/"));
    fontRequests.push(url);
    return mode === "complete"
      ? new Response(font, { status: 200 })
      : new Response("", { status: 503 });
  };

  const { GET } = await import("./src/app/og/route.tsx");
  const cases = [
    ["ordinary title", { t: "Zcash funding, in the open", k: "Grants and governance", s: "Zcash", n: "Q3 2026" }],
    ["single wide glyph", { t: "W" }],
    ["single punctuation glyph", { t: "." }],
    ["single narrow glyph", { t: "i" }],
    ["long unbroken title", { t: "W".repeat(2_000) }],
    ["all fields at their caps", { t: "W".repeat(90), k: "W".repeat(100), s: "W".repeat(40), n: "W".repeat(48) }],
    ["site card", {}],
  ];
  for (const [name, params] of cases) {
    console.log("render-start: " + name);
    const query = new URLSearchParams(params);
    const response = await GET(new Request("https://example.invalid/og?" + query));
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get("content-type"), "image/png", name);
    assert.ok(response.headers.get("cache-control").includes(
      mode === "complete" ? "max-age=86400" : "max-age=300",
    ), name);
    const png = Buffer.from(await response.arrayBuffer());
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", name);
    assert.equal(png.readUInt32BE(16), 1200, name);
    assert.equal(png.readUInt32BE(20), 630, name);
    assert.equal(response.headers.get("content-length"), String(png.length), name);
  }
  assert.equal(fontRequests.length, 3, "assets are loaded once across requests");
  console.log("rendered " + cases.length + " cards");
`;

function runRenderer(mode: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        renderCards,
        mode,
      ],
      {
        cwd: process.cwd(),
        timeout: CHILD_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: 64 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(
            `OG renderer failed (${mode}; signal=${error.signal ?? "none"}; code=${error.code ?? "none"}).\n${stdout}\n${stderr}`,
          ));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

describe("GET /og bounded rendering regression", () => {
  it.each(["complete", "fallback"])(
    "renders accepted titles with %s fonts without blocking the process",
    async (mode) => {
      expect(await runRenderer(mode)).toContain("rendered 7 cards");
    },
    CHILD_TIMEOUT_MS + 5_000,
  );
});
