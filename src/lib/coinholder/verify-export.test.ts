import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUNDS } from "./rounds";
import type { Round } from "./types";
import { parseVoteSummary, verifyRound } from "./verify";
import {
  chainReport,
  exportFilename,
  verifyCsv,
  verifyJson,
  zecDigits,
} from "./verify-export";
import type { ChainResult } from "./vote-chain";

const RAW = readFileSync(
  join(process.cwd(), "src/lib/coinholder/fixtures/q3-2026-vote-summary.json"),
);
const Q3_ID =
  "2cba66eb16c7581a1692cb0b033785da0131059f645a0d2fb4dc2a5131505e01";
const round = (id: string): Round => ROUNDS.find((r) => r.id === id)!;
const live: ChainResult = {
  ok: true,
  summary: parseVoteSummary(JSON.parse(RAW.toString("utf8"))),
  sha256: "9b858326b8149de92ea6788314a714b521fb2f57215e3742ec9b35b67c6639b5",
  bytes: RAW.byteLength,
  host: {
    id: "zf",
    name: "Zcash Foundation mirror",
    origin: "https://zvote.zfnd.org",
  },
  url: `https://zvote.zfnd.org/shielded-vote/v1/vote-summary/${Q3_ID}`,
  fetchedAt: "2026-09-30T22:36:20.000Z",
};

describe("zecDigits", () => {
  it("shows each round at the precision its source published", () => {
    expect(zecDigits(verifyRound(round("q3-2026")))).toBe(3);
    expect(zecDigits(verifyRound(round("q1-2026")))).toBe(2);
    expect(zecDigits(verifyRound(round("q4-2025")))).toBe(0);
  });
});

describe("verifyCsv", () => {
  it("writes one row per question with the four options, the rule and the published outcome", () => {
    const q3 = round("q3-2026");
    const csv = verifyCsv(q3, verifyRound(q3, live.ok ? live.summary : null));
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines).toHaveLength(38);
    expect(lines[0]).toBe(
      '"round","ballot","proposal","applicant","accept_zec","reject_zec","lower_zec","abstain_zec","total_zec","quorum_met","approve_share_pct","rule_outcome","published_outcome","agrees","matches_chain","note"',
    );
    expect(lines[14]).toBe(
      '"Q3 2026","14","Connaugh Zcash Videos","Connaugh","757044.250","187236.625","196044.000","1038923.250","2179248.125","yes","66.39","Funded","Funded","yes","yes","Published first as Abstain, then corrected to Funded."',
    );
  });

  it("leaves options a ballot did not offer, and a discarded question's figures, empty", () => {
    const q1 = round("q1-2026");
    const lines = verifyCsv(q1, verifyRound(q1)).split("\r\n");
    expect(lines[3]).toBe(
      '"Q1 2026","3","Maya Protocol Advanced Shielded ZEC Support","Maya Protocol","500496.82","111.12","","0.00","500607.94","yes","99.98","Funded","Funded","yes","",""',
    );
    expect(lines[7]).toMatch(
      /^"Q1 2026","7","Rescind .*","","","","","","","","","","Discarded","","","Discarded by FPF/,
    );
  });

  it("names the file after the round", () => {
    expect(exportFilename("q3-2026", "csv")).toBe(
      "coinholder-q3-2026-verify.csv",
    );
  });
});

describe("chainReport", () => {
  it("reports the host, hash and time of a live comparison, and every server that serves the summary", () => {
    expect(chainReport("q3-2026", live)).toEqual({
      status: "ok",
      chainRoundId: Q3_ID,
      host: "https://zvote.zfnd.org",
      hostName: "Zcash Foundation mirror",
      url: live.ok ? live.url : "",
      sha256:
        "9b858326b8149de92ea6788314a714b521fb2f57215e3742ec9b35b67c6639b5",
      bytes: RAW.byteLength,
      fetchedAt: "2026-09-30T22:36:20.000Z",
      servers: [
        `https://prod.vote-chain-primary.valargroup.org/shielded-vote/v1/vote-summary/${Q3_ID}`,
        `https://zvote.zfnd.org/shielded-vote/v1/vote-summary/${Q3_ID}`,
      ],
    });
  });

  it("says when the chain could not be reached, and is null for a round that never used it", () => {
    const down: ChainResult = {
      ok: false,
      tried: ["a", "b"],
      error: "offline",
      checkedAt: "2026-09-30T00:00:00.000Z",
    };
    expect(chainReport("q3-2026", down)).toMatchObject({
      status: "unavailable",
      error: "offline",
      checkedAt: "2026-09-30T00:00:00.000Z",
    });
    expect(chainReport("q1-2026", null)).toBeNull();
  });
});

describe("verifyJson", () => {
  it("carries the rule, the round, the counts, the chain report and rows the script can compare", () => {
    const q3 = round("q3-2026");
    const json = verifyJson(
      q3,
      verifyRound(q3, live.ok ? live.summary : null),
      chainReport("q3-2026", live),
    );
    expect(json.rule.quorumZec).toBe(420_000);
    expect(json.rule.text).toMatch(/Abstain/);
    expect(json.rule).toMatchObject({
      quorumCountsAbstain: true,
      confirmedBy: { covers: "Abstentions are left out of the majority." },
    });
    expect(json.round).toMatchObject({ id: "q3-2026", label: "Q3 2026" });
    expect(json.summary).toMatchObject({
      proposals: 37,
      quorumMet: 37,
      ruleAgrees: 37,
      chainMatches: 37,
      chainOnly: [],
    });
    expect(json.chain?.status).toBe("ok");
    expect(json.script).toBe(
      "https://openzcash.org/verify/coinholder_verify.py",
    );
    const connaugh = json.rows.find((r) => r.ballot === 14)!;
    expect(connaugh).toMatchObject({
      accept: 757_044.25,
      reject: 187_236.625,
      lower: 196_044,
      abstain: 1_038_923.25,
      rule: "Funded",
      published: "Funded",
      agrees: true,
      matchesChain: true,
      quorumMet: true,
      quorumMetWithoutAbstain: true,
    });
    expect(JSON.stringify(json)).not.toMatch(/"(?:ballot_count|voters)"\s*:/);
  });

  it("explains how a Coin Voting round is recounted instead of a chain check", () => {
    const q1 = round("q1-2026");
    const json = verifyJson(q1, verifyRound(q1), null);
    expect(json.chain).toBeNull();
    expect(json.recount?.links.map((l) => l.href)).toContain(
      "https://github.com/hhanh00/zcv",
    );
    expect(json.rows.find((r) => r.ballot === 7)).toMatchObject({
      published: "Discarded",
      rule: null,
      agrees: null,
    });
    // ZChat: over 420,000 ZEC with Abstain, under it without; rejected either way.
    expect(json.rows.find((r) => r.title.startsWith("ZChat"))).toMatchObject({
      quorumMet: true,
      quorumMetWithoutAbstain: false,
      rule: "Rejected",
    });
    expect(json.summary).toMatchObject({
      quorumMetWithoutAbstain: 4,
      turnsOnAbstain: 0,
    });
  });
});
