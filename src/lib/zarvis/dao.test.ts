import { describe, expect, it } from "vitest";
import { DAO_ROWS, daoContext, daoFilter } from "./dao";
import type { ZechubProposal } from "@/lib/dao/zechub";
const proposal = (id: number, title: string, status: string, over: Partial<ZechubProposal> = {}): ZechubProposal => ({ id, ref: `A${id}`, title, status, createdAt: `2026-0${(id % 9) + 1}-01T00:00:00.000Z`, yes: 10, no: 1, abstain: 0, proposer: "juno1abc", url: `https://daodao.zone/dao/juno1dao/proposals/A${id}`, ...over });
const proposals = [proposal(163, "Fund ZecHub Nigeria meetup", "open"), proposal(162, "Pay September contributors", "executed"), proposal(161, "Wiki translation bounty", "passed"), proposal(160, "Buy conference tickets", "rejected"), ...Array.from({ length: 20 }, (_, i) => proposal(159 - i, `Older proposal ${i}`, "executed"))];
const meta = { url: "https://daodao.zone/dao/juno1dao", fetchedAt: "2026-09-28T21:00:00.000Z" };
describe("ZecHub DAO context", () => {
  it("reads numbers, status words and title words from a question in English or Portuguese", () => {
    expect(daoFilter("What is proposal A161 about?")).toMatchObject({ numbers: [161] });
    expect(daoFilter("Which ZecHub DAO proposals are open?")).toMatchObject({ statuses: ["open"], tokens: [] });
    expect(daoFilter("Quais propostas da ZecHub DAO foram rejeitadas?")).toMatchObject({ statuses: ["rejected"] });
    expect(daoFilter("Did the DAO vote on the Nigeria meetup?")).toMatchObject({ numbers: [], statuses: [], tokens: ["did", "nigeria", "meetup"] });
  });
  it("puts provenance and the latest proposal first, then the proposals a question names", () => {
    const context = daoContext(proposals, "What is the latest ZecHub DAO proposal?", meta);
    expect(context).toMatchObject({ daoFetchedAt: meta.fetchedAt, dao: meta.url, proposalsListed: 24, latestProposal: { ref: "A163", status: "open" }, byStatus: { open: 1, executed: 21, passed: 1, rejected: 1 }, matched: 24 });
    expect(context.proposals).toHaveLength(DAO_ROWS); expect(context.proposals[0]).toMatchObject({ ref: "A163", votes: { yes: 10, no: 1, abstain: 0 }, url: proposals[0].url });
    expect(daoContext(proposals, "proposal A161", meta).proposals.map((p) => p.ref)).toEqual(["A161"]);
    expect(daoContext(proposals, "which proposals were rejected", meta).proposals.map((p) => p.ref)).toEqual(["A160"]);
    expect(daoContext(proposals, "nigeria meetup", meta).proposals.map((p) => p.ref)).toEqual(["A163"]);
    expect(daoContext([], "anything", meta)).toMatchObject({ latestProposal: null, matched: 0, proposals: [] });
    expect(context.note).toMatch(/not a Zcash protocol, ZCG or Zcash Foundation decision/);
  });
});
