import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUNDS } from "./rounds";
import { parseVoteSummary, verifyRound } from "./verify";
import {
  VERIFY_CSV_HEADER,
  chainReport,
  verifyCsv,
  zecDigits,
  type ChainReport,
} from "./verify-export";
import {
  abbreviateHash,
  chartText,
  columnLetter,
  decisionRows,
  expectations,
  formatShare,
  outcomeCounts,
  sheetFormulas,
  sortDecisions,
  verdictChecks,
  verdictOf,
  vetoNote,
} from "./verify-view";

const RAW = readFileSync(
  join(process.cwd(), "src/lib/coinholder/fixtures/q3-2026-vote-summary.json"),
);
const HASH = "9b858326b8149de92ea6788314a714b521fb2f57215e3742ec9b35b67c6639b5";
const round = (id: string) => ROUNDS.find((r) => r.id === id)!;
const q3 = round("q3-2026");
const summary = () => parseVoteSummary(JSON.parse(RAW.toString("utf8")));
const live = (s = summary()) =>
  chainReport("q3-2026", {
    ok: true,
    summary: s,
    sha256: HASH,
    bytes: RAW.byteLength,
    host: {
      id: "valar",
      name: "Valar Group",
      origin: "https://prod.vote-chain-primary.valargroup.org",
    },
    url: "https://prod.vote-chain-primary.valargroup.org/x",
    fetchedAt: "2026-09-30T22:36:19.000Z",
  })!;
const down: ChainReport = chainReport("q3-2026", {
  ok: false,
  tried: [],
  error: "offline",
  checkedAt: "2026-09-30T22:40:00.000Z",
})!;

describe("the verdict", () => {
  it("counts every Q3 result as checking out against the rule and the vote chain", () => {
    const v = verdictOf(verifyRound(q3, summary()), live());
    expect(v).toMatchObject({
      passed: 37,
      judged: 37,
      positive: true,
      count: "37 of 37",
      rest: "results check out",
      failLine: null,
    });
  });

  it("is not positive when the vote chain did not answer, though the rule still checks out", () => {
    const v = verdictOf(verifyRound(q3, null), down);
    expect(v.count).toBe("37 of 37");
    expect(v.positive).toBe(false);
  });

  it("names each result that does not check out, and why", () => {
    const s = summary();
    s.proposals[13] = {
      ...s.proposals[13],
      lower: s.proposals[13].lower + 0.125,
    };
    s.proposals.push({ ...s.proposals[0], ballot: 38 });
    const v = verdictOf(verifyRound(q3, s), live(s));
    expect(v.count).toBe("36 of 37");
    expect(v.positive).toBe(false);
    expect(v.failLine).toBe(
      "#14 Connaugh Zcash Videos does not: its tally differs from the vote chain. Ballot 38 is on the vote chain but not on this page.",
    );
  });

  it("says when the rule and the published outcome part, for several results", () => {
    const changed = {
      ...q3,
      proposals: q3.proposals.map((p) =>
        p.question === 1 || p.question === 4
          ? {
              ...p,
              outcome:
                p.outcome === "funded"
                  ? ("rejected" as const)
                  : ("funded" as const),
            }
          : p,
      ),
    };
    const v = verdictOf(verifyRound(changed, null), null);
    expect(v.count).toBe("35 of 37");
    expect(v.failLine).toBe(
      "2 do not: #1 Zcash Grants Hub (ZIP 1016 gives Rejected, published Funded) and #4 zcashtocash via ZcashLabs (ZIP 1016 gives Funded, published Rejected).",
    );
  });

  it("puts the minimum, the rule and the chain in a row of three, or the tallies' source for a Coin Voting round", () => {
    const q3Checks = verdictChecks(q3, verifyRound(q3, summary()), live());
    expect(q3Checks.map((c) => [c.mark, c.text, c.sub])).toEqual([
      [
        "ok",
        "quorum met on all",
        "420,000 ZEC or more, with or without Abstain",
      ],
      ["ok", "ZIP 1016 gives the published outcome", "all 37 proposals"],
      ["ok", "equals the vote chain", "all four options · Valar Group"],
    ]);
    expect(verdictChecks(q3, verifyRound(q3, null), down)[2]).toMatchObject({
      mark: "quiet",
      text: "vote chain unavailable just now",
    });
    const q1 = round("q1-2026");
    const q1Checks = verdictChecks(q1, verifyRound(q1), null);
    expect(q1Checks[0].sub).toBe(
      "420,000 ZEC or more with Abstain · 4 of 6 without",
    );
    expect(q1Checks[2]).toMatchObject({
      mark: "source",
      text: "tallies from the Voting Authorities' recount",
      href: expect.stringContaining("55048/17"),
    });
    const poll = round("ratification-2025");
    expect(verdictChecks(poll, verifyRound(poll), null)[1].sub).toBe(
      "all 3 questions, for comparison only",
    );
  });
});

describe("the decision chart", () => {
  const check = verifyRound(q3, summary());
  const rows = decisionRows(q3, check, zecDigits(check));

  it("splits the ZEC for or against into Accept, Reject and Reject at a lower amount, Abstain left out", () => {
    const connaugh = rows.find((r) => r.ballot === 14)!;
    expect(connaugh.segments.map((s) => s.name)).toEqual([
      "Accept",
      "Reject",
      "Reject at a lower amount",
    ]);
    expect(connaugh.segments.reduce((a, s) => a + s.part, 0)).toBeCloseTo(
      1,
      12,
    );
    expect(connaugh.segments[0].part).toBeCloseTo(0.6639, 4);
    expect(connaugh).toMatchObject({
      outcome: "Funded",
      shareText: "66.4%",
      flag: { tag: "corrected", tone: "note" },
    });
    expect(connaugh.tooltip).toBe(
      "Accept 757,044.250 · Reject 187,236.625 · Reject at a lower amount 196,044.000 · Abstain 1,038,923.250 · Total 2,179,248.125 ZEC",
    );
  });

  it("sorts by share, highest first, or by ballot; a question without a tally goes last", () => {
    expect(
      sortDecisions(rows, "share")
        .map((r) => r.ballot)
        .slice(0, 3),
    ).toEqual([33, 34, 32]);
    expect(
      sortDecisions(rows, "ballot")
        .map((r) => r.ballot)
        .slice(0, 3),
    ).toEqual([1, 2, 3]);
    const q1 = round("q1-2026");
    const q1Check = verifyRound(q1);
    const q1Rows = decisionRows(q1, q1Check, zecDigits(q1Check));
    const last = sortDecisions(q1Rows, "share").at(-1)!;
    expect(last).toMatchObject({
      ballot: 7,
      outcome: "Discarded",
      tone: "none",
      segments: [],
      flag: { tag: "discarded" },
    });
    expect(last.description).toContain(
      "No published tally. Published: Discarded.",
    );
  });

  it("marks the vetoed Q4 2025 grant, which the rule funds and the key-holders stopped", () => {
    const q4 = round("q4-2025");
    const c = verifyRound(q4);
    const ecc = decisionRows(q4, c, zecDigits(c)).find((r) => r.flag)!;
    expect(ecc).toMatchObject({ outcome: "Funded", flag: { tag: "vetoed" } });
    expect(ecc.description).toContain("Published: Vetoed.");
  });

  it("marks a rule that parts from the published outcome, and a tally that differs from the chain", () => {
    const s = summary();
    s.proposals[0] = { ...s.proposals[0], accept: s.proposals[0].accept + 1 };
    const c = verifyRound(q3, s);
    const first = decisionRows(q3, c, 3).find((r) => r.ballot === 1)!;
    expect(first.flag).toMatchObject({ tag: "chain differs", tone: "bad" });
    expect(first.flag!.text).toMatch(/^Vote chain: Accept 79,509\.000 · /);
  });

  it("uses Yes and No for the ratification poll", () => {
    const poll = round("ratification-2025");
    const text = chartText(poll, verifyRound(poll));
    expect(text).toMatchObject({
      title: "How each question was decided",
      sub: "ZEC for Yes or No · the line is 50%",
      sortShare: "Yes share",
      right: "Outcome and Yes share on the right",
    });
    expect(text.legend.map((l) => l.name)).toEqual(["Yes", "No"]);
    expect(chartText(q3, check)).toMatchObject({
      sortShare: "Accept share",
      right: "Outcome and Accept share on the right",
    });
    expect(chartText(q3, check).sub).toBe(
      "ZEC for or against · the line is 50% · Abstain left out",
    );
  });

  it("never rounds a share to 100.0% or 0.0% while the other side has ZEC", () => {
    expect(formatShare(0.999996)).toBe(">99.9%");
    expect(formatShare(0.0004)).toBe("<0.1%");
    expect(formatShare(1)).toBe("100.0%");
    expect(formatShare(0.8055209915736298)).toBe("80.6%");
  });
});

describe("what each rebuild step should print", () => {
  it("comes from the round's own data", () => {
    const c = verifyRound(q3, summary());
    expect(expectations(q3, c, live())).toEqual({
      hash: { text: "sha256 9b858326…6639b5", full: HASH },
      rows: "37 rows × 4 options",
      outcomes: "17 Funded · 20 Rejected",
      compare: "compare: 37 of 37 agree",
      tallies: "37 tallies",
      script: "coinholder_verify.py",
      run: "37 rows · sha256 9b858326…6639b5",
      sheetRows: "37 rows + header",
      totals: "TRUE on 37 rows",
    });
    expect(expectations(q3, verifyRound(q3), down).hash).toBeNull();
    // One short form on the whole page: the steps' chips match the verdict's.
    expect(abbreviateHash(HASH)).toBe("9b858326…6639b5");
  });

  it("says, where a round has a vetoed grant, that the rule counts it Funded", () => {
    expect(vetoNote(round("q4-2025"))).toBe(
      "The vetoed grant passed the rule, so the rule counts it Funded; the veto came afterwards.",
    );
    for (const id of ["q3-2026", "q1-2026", "ratification-2025"])
      expect(vetoNote(round(id)), id).toBe("");
  });

  it("counts the rule outcomes of every round", () => {
    const counts = (id: string) => outcomeCounts(verifyRound(round(id)));
    expect(counts("q3-2026")).toBe("17 Funded · 20 Rejected");
    expect(counts("q1-2026")).toBe("1 Funded · 5 Rejected");
    expect(counts("q4-2025")).toBe("5 Funded · 4 Rejected");
    expect(counts("ratification-2025")).toBe("3 Passed");
  });
});

describe("the spreadsheet path", () => {
  it("names columns as a spreadsheet does", () => {
    expect([0, 4, 25, 26, 27, 51, 52].map(columnLetter)).toEqual([
      "A",
      "E",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
    ]);
  });

  it("takes its column letters from the CSV, and its formula gives every published outcome", () => {
    const check = verifyRound(q3);
    const f = sheetFormulas(q3, check);
    expect(f.importFormula).toBe(
      '=IMPORTDATA("https://openzcash.org/api/coinholders/verify?round=q3-2026&format=csv")',
    );
    expect(f.totalFormula).toBe("=E2+F2+G2+H2=I2");
    expect(f.ruleFormula).toBe(
      '=IF(AND(E2+F2+G2+H2>=420000, E2>F2+G2), "Funded", "Rejected")',
    );
    expect([
      f.totalCell,
      f.ruleCell,
      f.columns.rule,
      f.columns.published,
    ]).toEqual(["Q", "R", "L", "M"]);

    // Evaluate both formulas on every row of the CSV itself, by column letter.
    const lines = verifyCsv(q3, check).replace(/^﻿/, "").split("\r\n");
    const cells = (line: string) =>
      [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) =>
        m[1].replace(/""/g, '"'),
      );
    expect(cells(lines[0])).toEqual([...VERIFY_CSV_HEADER]);
    const at = (row: string[], letter: string) =>
      row[letter.charCodeAt(0) - 65];
    const n = (row: string[], letter: string) => Number(at(row, letter));
    for (const line of lines.slice(1)) {
      const row = cells(line);
      const sum = n(row, "E") + n(row, "F") + n(row, "G") + n(row, "H");
      expect(sum, row[1]).toBe(n(row, "I"));
      const outcome =
        sum >= 420_000 && n(row, "E") > n(row, "F") + n(row, "G")
          ? "Funded"
          : "Rejected";
      expect(outcome, row[1]).toBe(at(row, f.columns.rule));
      expect(outcome, row[1]).toBe(at(row, f.columns.published));
    }
  });
});
