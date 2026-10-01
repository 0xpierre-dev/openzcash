import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUNDS } from "./rounds";
import type { Round, RoundProposal } from "./types";
import {
  applyZip1016,
  findVerifiableRound,
  parseVoteSummary,
  verifyRound,
  VERIFIABLE_ROUNDS,
  ZIP_1016_RULE,
  type VoteSummary,
} from "./verify";

const FIXTURE = join(
  process.cwd(),
  "src/lib/coinholder/fixtures/q3-2026-vote-summary.json",
);
const RAW = readFileSync(FIXTURE);
const LIVE = () =>
  JSON.parse(RAW.toString("utf8")) as {
    proposals: { id: number; options: Record<string, unknown>[] }[];
  };

const round = (id: string): Round => {
  const r = ROUNDS.find((x) => x.id === id);
  if (!r) throw new Error(`missing round ${id}`);
  return r;
};

describe("ZIP 1016 as FPF applies it", () => {
  it("needs 420,000 ZEC voted on the question, Abstain included", () => {
    expect(
      applyZip1016({ approve: 420_000, reject: 0, abstain: 0 }).quorumMet,
    ).toBe(true);
    expect(
      applyZip1016({ approve: 419_999.875, reject: 0, abstain: 0 }).quorumMet,
    ).toBe(false);
    const withAbstain = applyZip1016({
      approve: 10,
      reject: 5,
      rejectLower: 0,
      abstain: 419_990,
    });
    expect(withAbstain.total).toBe(420_005);
    expect(withAbstain.quorumMet).toBe(true);
    expect(withAbstain.passes).toBe(true);
    // ZIP 1016 does not say whether Abstain counts toward the minimum, so the other reading is kept beside it.
    expect(withAbstain.quorumMetWithoutAbstain).toBe(false);
    expect(
      applyZip1016({ approve: 300_000, reject: 120_000, abstain: 9 })
        .quorumMetWithoutAbstain,
    ).toBe(true);
  });

  it("cites FPF's reply for the majority test only, never as a correction of another round", () => {
    expect(ZIP_1016_RULE.confirmedBy.href).toContain("/57909/4");
    expect(ZIP_1016_RULE.confirmedBy.covers).toMatch(/majority/);
    expect(ZIP_1016_RULE.confirmedBy.covers).not.toMatch(/minimum|quorum/i);
    expect(ZIP_1016_RULE.confirmedBy.label).not.toMatch(/correction/i);
    expect(ZIP_1016_RULE.quorumCountsAbstain).toBe(true);
    expect(ZIP_1016_RULE.text).toMatch(
      /does not say whether Abstain counts toward the 420,000 ZEC minimum/,
    );
    expect(ZIP_1016_RULE.text).not.toMatch(/count toward the minimum, not the majority/);
  });

  it("passes on more ZEC for Accept than both Reject options together; abstentions are left out", () => {
    const r = applyZip1016({
      approve: 500_000,
      reject: 300_000,
      rejectLower: 200_001,
      abstain: 5_000_000,
    });
    expect(r.decided).toBe(1_000_001);
    expect(r.passes).toBe(false);
    const tie = applyZip1016({
      approve: 500_000,
      reject: 250_000,
      rejectLower: 250_000,
      abstain: 0,
    });
    expect(tie.approveShare).toBe(0.5);
    expect(tie.passes).toBe(false);
    expect(
      applyZip1016({ approve: 0, reject: 0, abstain: 600_000 }),
    ).toMatchObject({
      quorumMet: true,
      approveShare: null,
      passes: false,
    });
  });
});

describe("parseVoteSummary", () => {
  it("reads the finalized Q3 2026 summary byte for byte as the vote chain served it", () => {
    expect(createHash("sha256").update(RAW).digest("hex")).toBe(
      "9b858326b8149de92ea6788314a714b521fb2f57215e3742ec9b35b67c6639b5",
    );
    const s = parseVoteSummary(LIVE());
    expect(s.proposals).toHaveLength(37);
    expect(s.proposals.map((p) => p.ballot)).toEqual(
      Array.from({ length: 37 }, (_, i) => i + 1),
    );
    expect(s.description).toBe("Coinholder Retroactive Grants Q3");
    // Units of 0.125 ZEC, divided by 8.
    expect(s.proposals[0]).toMatchObject({
      ballot: 1,
      accept: 79_508,
      reject: 1_391_627.875,
      lower: 32.625,
      abstain: 710_283.375,
    });
  });

  it("treats an option without total_value (or ballot_count, or index) as zero ZEC", () => {
    const q3 = parseVoteSummary(LIVE()).proposals.find((p) => p.ballot === 3)!;
    expect(q3.lower).toBe(0);
    expect(q3.accept).toBe(396_819.875);
  });

  it("never exposes ballot_count: it counts revealed encrypted shares, not voters", () => {
    const p = parseVoteSummary(LIVE()).proposals[0] as unknown as Record<
      string,
      unknown
    >;
    expect(Object.keys(p).some((k) => /count|ballots|voters/i.test(k))).toBe(
      false,
    );
  });

  const malformed: [string, (j: ReturnType<typeof LIVE>) => unknown][] = [
    ["not an object", () => "nope"],
    ["null", () => null],
    ["no proposals", (j) => ({ ...j, proposals: undefined })],
    ["empty proposals", (j) => ({ ...j, proposals: [] })],
    [
      "a fractional total_value",
      (j) => {
        j.proposals[0].options[0].total_value = 1.5;
        return j;
      },
    ],
    [
      "a negative total_value",
      (j) => {
        j.proposals[0].options[0].total_value = -8;
        return j;
      },
    ],
    [
      "a total_value given as text",
      (j) => {
        j.proposals[0].options[0].total_value = "636064";
        return j;
      },
    ],
    [
      "an unknown option",
      (j) => {
        j.proposals[0].options[0].label = "Maybe";
        return j;
      },
    ],
    [
      "two Accept options",
      (j) => {
        j.proposals[0].options[1].label = "Accept";
        return j;
      },
    ],
    [
      "a missing Accept option",
      (j) => {
        j.proposals[0].options.splice(0, 1);
        return j;
      },
    ],
    [
      "a repeated ballot number",
      (j) => {
        j.proposals[1].id = 1;
        return j;
      },
    ],
    [
      "a ballot number that is not a positive integer",
      (j) => {
        j.proposals[0].id = 0;
        return j;
      },
    ],
    [
      "a missing title",
      (j) => {
        delete (j.proposals[0] as Record<string, unknown>).title;
        return j;
      },
    ],
    [
      "options that are not a list",
      (j) => {
        (j.proposals[0] as Record<string, unknown>).options = {};
        return j;
      },
    ],
  ];
  it.each(malformed)("rejects %s", (_, mutate) => {
    expect(() => parseVoteSummary(mutate(LIVE()))).toThrow(/vote summary/i);
  });
});

describe("verifyRound", () => {
  it("lists the rounds that held a vote, newest first, and finds them case-insensitively", () => {
    expect(VERIFIABLE_ROUNDS.map((r) => r.id)).toEqual([
      "q3-2026",
      "q1-2026",
      "q4-2025",
      "ratification-2025",
    ]);
    expect(findVerifiableRound("Q1-2026")?.id).toBe("q1-2026");
    expect(findVerifiableRound(undefined)?.id).toBe("q3-2026");
    expect(findVerifiableRound("q2-2026")).toBeNull();
    expect(findVerifiableRound("nope")).toBeNull();
  });

  it("checks every Q3 2026 proposal in ballot order: quorum met and the rule agrees on all 37", () => {
    const check = verifyRound(round("q3-2026"));
    expect(check.kind).toBe("grants");
    expect(check.rows.map((r) => r.ballot)).toEqual(
      Array.from({ length: 37 }, (_, i) => i + 1),
    );
    expect(check.counts).toEqual({
      proposals: 37,
      withTally: 37,
      quorumMet: 37,
      quorumMetWithoutAbstain: 37,
      turnsOnAbstain: 0,
      ruleChecked: 37,
      ruleAgrees: 37,
      chainChecked: null,
      chainMatches: null,
    });
    expect(check.rows.every((r) => r.matchesChain === null)).toBe(true);
    expect(check.rows.filter((r) => r.rule === "funded")).toHaveLength(17);
  });

  it("notes the Connaugh correction: first published as Abstain, Funded under the rule", () => {
    const row = verifyRound(round("q3-2026")).rows.find(
      (r) => r.ballot === 14,
    )!;
    expect(row).toMatchObject({
      title: "Connaugh Zcash Videos",
      accept: 757_044.25,
      reject: 187_236.625,
      lower: 196_044,
      abstain: 1_038_923.25,
      total: 2_179_248.125,
      quorumMet: true,
      rule: "funded",
      published: "funded",
      agrees: true,
    });
    expect(row.approveShare).toBeCloseTo(0.6639, 4);
    expect(row.note?.text).toMatch(/first as Abstain.*corrected to Funded/i);
    expect(row.note?.href).toContain("/57909/4");
  });

  it("matches all four options of every Q3 question against the finalized vote-chain summary", () => {
    const check = verifyRound(round("q3-2026"), parseVoteSummary(LIVE()));
    expect(check.counts.chainChecked).toBe(37);
    expect(check.counts.chainMatches).toBe(37);
    expect(check.chainOnly).toEqual([]);
    expect(check.rows.every((r) => r.matchesChain === true)).toBe(true);
  });

  it("flags a single 0.125 ZEC difference, and ballots missing on either side", () => {
    const j = LIVE();
    const opt = j.proposals[13].options[2] as { total_value: number };
    opt.total_value += 1;
    const extra = structuredClone(j.proposals[0]);
    extra.id = 38;
    j.proposals.push(extra);
    j.proposals.splice(36, 1); // drop ballot 37
    const check = verifyRound(round("q3-2026"), parseVoteSummary(j));
    expect(check.rows.find((r) => r.ballot === 14)?.matchesChain).toBe(false);
    expect(check.rows.find((r) => r.ballot === 14)?.chain).toMatchObject({
      lower: 196_044.125,
    });
    expect(check.rows.find((r) => r.ballot === 37)?.matchesChain).toBe(false);
    expect(check.rows.find((r) => r.ballot === 37)?.chain).toBeNull();
    expect(check.counts.chainMatches).toBe(35);
    expect(check.chainOnly).toEqual([38]);
  });

  it("checks Q1 2026 from the Voting Authorities' recount and leaves the discarded question out, saying why", () => {
    const check = verifyRound(round("q1-2026"));
    expect(check.counts).toMatchObject({
      proposals: 7,
      withTally: 6,
      quorumMet: 6,
      ruleChecked: 6,
      ruleAgrees: 6,
      chainChecked: null,
    });
    // Without Abstain, two questions fall under 420,000 ZEC; both were rejected either way.
    expect(check.counts).toMatchObject({
      quorumMetWithoutAbstain: 4,
      turnsOnAbstain: 0,
    });
    expect(
      check.rows
        .filter((r) => r.quorumMetWithoutAbstain === false)
        .map((r) => [r.title.split(":")[0], r.rule]),
    ).toEqual([
      ["ZChat", "rejected"],
      ["zcash.me", "rejected"],
    ]);
    const maya = check.rows.find((r) => r.ballot === 3)!;
    expect(maya).toMatchObject({
      rule: "funded",
      published: "funded",
      agrees: true,
      lower: null,
      abstain: 0,
    });
    const discarded = check.rows.find((r) => r.ballot === 7)!;
    expect(discarded).toMatchObject({
      accept: null,
      total: null,
      quorumMet: null,
      rule: null,
      published: "discarded",
      agrees: null,
    });
    expect(discarded.note?.text).toMatch(/discarded/i);
  });

  it("counts the vetoed Q4 2025 ECC grant as agreeing: it passed the vote and was vetoed afterwards", () => {
    const check = verifyRound(round("q4-2025"));
    expect(check.counts).toMatchObject({
      proposals: 9,
      withTally: 9,
      quorumMet: 9,
      ruleChecked: 9,
      ruleAgrees: 9,
    });
    const ecc = check.rows.find((r) => r.ballot === 3)!;
    expect(ecc).toMatchObject({
      rule: "funded",
      published: "vetoed",
      agrees: true,
      lower: null,
      abstain: null,
    });
    expect(ecc.note?.text).toMatch(/vetoed/i);
  });

  it("reads the ratification poll as Passed or Not passed", () => {
    const check = verifyRound(round("ratification-2025"));
    expect(check.kind).toBe("poll");
    expect(check.rows.map((r) => r.rule)).toEqual([
      "passed",
      "passed",
      "passed",
    ]);
    expect(check.counts.ruleAgrees).toBe(3);
  });

  it("finds no outcome in any round that depends on whether Abstain counts toward the minimum", () => {
    for (const r of VERIFIABLE_ROUNDS)
      expect(verifyRound(r).counts.turnsOnAbstain, r.id).toBe(0);
  });

  it("reports a published outcome the rule does not give", () => {
    const q = round("q4-2025");
    const flipped: RoundProposal[] = q.proposals.map((p) =>
      p.question === 5 ? { ...p, outcome: "funded" } : p,
    );
    const check = verifyRound({ ...q, proposals: flipped });
    expect(check.rows.find((r) => r.ballot === 5)).toMatchObject({
      rule: "rejected",
      published: "funded",
      agrees: false,
    });
    expect(check.counts.ruleAgrees).toBe(8);
  });

  it("matches a live summary by ballot number only, so another round's summary matches nothing", () => {
    const summary: VoteSummary = parseVoteSummary(LIVE());
    const check = verifyRound(round("q4-2025"), summary);
    // Ballot numbers 1–9 exist on the Q3 chain, but their tallies differ: nothing matches.
    expect(check.counts.chainMatches).toBe(0);
  });
});
