import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseVoteSummary } from "@/lib/coinholder/verify";
import type { ChainResult } from "@/lib/coinholder/vote-chain";

const RAW = readFileSync(
  join(process.cwd(), "src/lib/coinholder/fixtures/q3-2026-vote-summary.json"),
);
const Q3_ID =
  "2cba66eb16c7581a1692cb0b033785da0131059f645a0d2fb4dc2a5131505e01";
const LIVE: ChainResult = {
  ok: true,
  summary: parseVoteSummary(JSON.parse(RAW.toString("utf8"))),
  sha256: "9b858326b8149de92ea6788314a714b521fb2f57215e3742ec9b35b67c6639b5",
  bytes: RAW.byteLength,
  host: {
    id: "valar",
    name: "Valar Group",
    origin: "https://prod.vote-chain-primary.valargroup.org",
  },
  url: `https://prod.vote-chain-primary.valargroup.org/shielded-vote/v1/vote-summary/${Q3_ID}`,
  fetchedAt: "2026-09-30T22:36:19.000Z",
};

const chain = vi.hoisted(() => ({ fetchVoteSummary: vi.fn() }));
vi.mock("@/lib/coinholder/vote-chain", () => chain);

import { GET } from "./route";

const get = (query: string) =>
  GET(new Request(`https://openzcash.org/api/coinholders/verify${query}`));

beforeEach(() => {
  chain.fetchVoteSummary.mockReset();
  chain.fetchVoteSummary.mockResolvedValue(LIVE);
});

describe("GET /api/coinholders/verify", () => {
  it("returns Q3 2026 as JSON by default, checked against the vote chain", async () => {
    const res = await get("");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="coinholder-q3-2026-verify.json"',
    );
    expect(res.headers.get("cache-control")).toMatch(/^public, max-age=\d+/);
    const body = await res.json();
    expect(chain.fetchVoteSummary).toHaveBeenCalledWith(Q3_ID);
    expect(body.round.id).toBe("q3-2026");
    expect(body.summary).toMatchObject({
      proposals: 37,
      ruleAgrees: 37,
      chainMatches: 37,
    });
    expect(body.chain).toMatchObject({
      status: "ok",
      sha256: LIVE.ok ? LIVE.sha256 : "",
      host: "https://prod.vote-chain-primary.valargroup.org",
    });
    expect(body.rows).toHaveLength(37);
  });

  it("serves the CSV as a download named after the round", async () => {
    const res = await get("?round=q3-2026&format=csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="coinholder-q3-2026-verify.csv"',
    );
    const text = await res.text();
    expect(text.split("\r\n")).toHaveLength(38);
    expect(text).toContain('"Connaugh Zcash Videos"');
  });

  it("still answers from the curated tallies when the chain is unreachable, and caches that briefly", async () => {
    chain.fetchVoteSummary.mockResolvedValue({
      ok: false,
      tried: [],
      error: "offline",
      checkedAt: "2026-09-30T00:00:00.000Z",
    });
    const res = await get("?round=Q3-2026");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    const body = await res.json();
    expect(body.chain).toMatchObject({
      status: "unavailable",
      error: "offline",
    });
    expect(body.summary).toMatchObject({ ruleAgrees: 37, chainMatches: null });
  });

  it("checks earlier rounds from their published tallies without asking the vote chain", async () => {
    const res = await get("?round=q1-2026&format=json");
    const body = await res.json();
    expect(chain.fetchVoteSummary).not.toHaveBeenCalled();
    expect(body.chain).toBeNull();
    expect(body.summary).toMatchObject({
      proposals: 7,
      ruleChecked: 6,
      ruleAgrees: 6,
    });
  });

  it("answers 404 in JSON for an unknown round or one that held no vote, listing the rounds it knows", async () => {
    for (const q of ["?round=q9-2031", "?round=q2-2026"]) {
      const res = await get(q);
      expect(res.status, q).toBe(404);
      expect(res.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
      expect(res.headers.get("cache-control")).toBe("no-store");
      const body = await res.json();
      expect(body.error).toMatch(/round/i);
      expect(body.rounds).toEqual([
        "q3-2026",
        "q1-2026",
        "q4-2025",
        "ratification-2025",
      ]);
    }
  });

  it("answers 400 for an unknown format and never echoes more than a short slice of the input", async () => {
    const res = await get(`?format=${"x".repeat(500)}`);
    expect(res.status).toBe(400);
    expect((await res.json()).error.length).toBeLessThan(120);
  });
});
