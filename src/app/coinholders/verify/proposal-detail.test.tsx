import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROUNDS } from "@/lib/coinholder/rounds";
import { parseVoteSummary, verifyRound } from "@/lib/coinholder/verify";
import { proposalVerifyHref } from "@/lib/coinholder/proposal-decision";
import { zecDigits } from "@/lib/coinholder/verify-export";
import { backOf } from "@/lib/design-routes";
import { ProposalDetail } from "./proposal-detail";
import { ResultsBoard } from "../results-board";

const chain = vi.hoisted(() => ({ fetchVoteSummary: vi.fn() }));
vi.mock("@/lib/coinholder/vote-chain", () => chain);
import Page from "./[round]/[proposal]/page";
const raw = JSON.parse(readFileSync("src/lib/coinholder/fixtures/q3-2026-vote-summary.json", "utf8"));
beforeEach(() => chain.fetchVoteSummary.mockResolvedValue({ ok: true, summary: parseVoteSummary(raw), sha256: "a".repeat(64), bytes: 100, host: { name: "Valar Group", origin: "https://prod.vote-chain-primary.valargroup.org" }, url: "https://prod.vote-chain-primary.valargroup.org/tally", fetchedAt: "2026-10-02T19:45:00.000Z" }));
const render = async (round: string, proposal: string) => renderToStaticMarkup(await Page({ params: Promise.resolve({ round, proposal }) }));

describe("proposal detail route", () => {
  it("shows a corrected result, exact tallies, both arithmetic tests, and dated FPF attribution", async () => {
    const html = await render("q3-2026", "55");
    expect(html).toContain("Connaugh Zcash Videos");
    expect(html).toContain("2,179,248.125");
    expect(html).toContain("<title>Accept: 757,044.250 ZEC</title>");
    expect(html).toContain("570,162.4375");
    expect(html).toContain("66.4%");
    expect(html).toContain("34.7%");
    expect(html).toContain("Key numbers");
    expect(html).toContain("Vote totals, all options");
    expect(html).toContain("Majority cutoff (50%)");
    expect(html).toContain("Directional vote, without Abstain");
    expect(html).toContain("Reject, do not support");
    expect(html).toContain("Reject, lower amount");
    expect(html).toContain("with or without Abstain");
    expect(html).toContain("Corrected after publication");
    expect(html).toContain("FPF’s current counting rule");
    expect(html).toContain("/57909/19");
    expect(html).toContain("explicit choice, not a default");
    expect(html).toContain("Verify it yourself");
    expect(html).toContain("Every option matches the vote-chain summary");
    expect(html).toContain("select(.id == 14)");
    expect(html).toContain("not proof of disbursement");
  });

  it("handles every historical question and preserves veto and discarded states", () => {
    for (const round of ROUNDS) {
      const check = verifyRound(round);
      for (const proposal of round.proposals) {
        const row = check.rows.find(r => r.id === proposal.id)!;
        const html = renderToStaticMarkup(<ProposalDetail round={round} proposal={proposal} row={row} chain={null} digits={zecDigits(check)} poll={check.kind === "poll"} />);
        if (proposal.outcome === "discarded") { expect(html).toContain("No published tally"); expect(html).not.toContain("<svg"); }
        if (proposal.outcome === "vetoed") { expect(html).toContain("Passed, then vetoed"); expect(html).not.toContain("Proposal funded</h2>"); }
        if (check.kind === "poll") expect(html).toContain("For comparison only");
      }
    }
  });

  it("does not claim live verification when the chain is unavailable", async () => {
    chain.fetchVoteSummary.mockResolvedValue({ ok: false, error: "Unavailable", checkedAt: "2026-10-02T19:45:00.000Z" });
    const html = await render("q3-2026", "55");
    expect(html).toContain("not a fresh verification");
    expect(html).not.toContain("Every option matches");
  });

  it("returns not found for unknown rounds, unknown proposals, and ballot-number guesses", async () => {
    await expect(render("q5-2026", "55")).rejects.toThrow();
    await expect(render("q3-2026", "not-a-proposal")).rejects.toThrow();
    await expect(render("q2-2026", "55")).rejects.toThrow();
  });

  it("links every proposal title from results, and keeps the shell in the verify hierarchy", () => {
    for (const round of ROUNDS.filter(r => r.proposals.length)) {
      const html = renderToStaticMarkup(<ResultsBoard roundId={round.id} proposals={round.proposals} ballot={round.ballot} />);
      for (const proposal of round.proposals) {
        const href = proposalVerifyHref(round.id, proposal.id);
        expect(html).toContain(`href="${href}"`);
        expect(backOf(href)).toEqual({ href: "/coinholders/verify", label: "Verify it yourself" });
      }
    }
  });

  it("corrects Q3's default-Abstain claim without rewriting the Q1 interface history", () => {
    const q3 = ROUNDS.find(r => r.id === "q3-2026")!;
    const q1 = ROUNDS.find(r => r.id === "q1-2026")!;
    expect(q3.votingSystem).toContain("explicitly select Abstain");
    expect(q3.turnout).not.toContain("defaults");
    expect(q1.votingSystem).toContain("defaulting to Abstain");
  });
});
