import { describe, expect, it } from "vitest";
import { decisionsContext, type ProposalRecord } from "./decisions";

const proposal = (over: Partial<ProposalRecord>): ProposalRecord => ({
  id: "p1",
  program: "zcg",
  title: "Zebra indexer",
  status: "approved",
  decisionDate: "2026-08-12",
  submittedDate: "2026-07-01",
  applicantsRaw: "Zingo Labs",
  requestedUsdCents: 12_500_000n,
  platformLink:
    "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/340",
  importedAt: "2026-09-27T03:00:00.000Z",
  ...over,
});
const proposals = [
  proposal({}),
  proposal({
    id: "p2",
    title: "Privacy meetup",
    status: "rejected",
    decisionDate: "2026-08-12",
    applicantsRaw: "Ana",
    requestedUsdCents: 800_000n,
    platformLink:
      "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/341",
  }),
  proposal({
    id: "p3",
    title: "Old tooling",
    status: "withdrawn",
    decisionDate: null,
    submittedDate: "2025-11-02",
    applicantsRaw: "Bob",
    requestedUsdCents: null,
    platformLink: null,
  }),
  proposal({
    id: "p4",
    program: "coinholder",
    title: "Node hosting",
    status: "filtered",
    decisionDate: "2026-02-20",
    applicantsRaw: "Carol",
    platformLink:
      "https://github.com/Financial-Privacy-Foundation/ZcashCoinholderGrantsProgram/issues/9",
  }),
  proposal({
    id: "p5",
    title: "Pending idea",
    status: "under_review",
    decisionDate: null,
    submittedDate: "2026-09-20",
  }),
];
const meetings = [
  {
    meetingDate: "2026-08-12",
    title: "ZCG meeting",
    url: "https://forum.zcashcommunity.com/t/zcg-minutes/1",
  },
];
const meta = { publishedThrough: "2026-09-27" };

describe("ZCG decision history lookup", () => {
  it("returns dated verdicts newest first with application and minutes links, plus applicant withdrawals", () => {
    const all = decisionsContext(
      proposals,
      meetings,
      ["Zebra indexer"],
      "",
      meta,
    );
    expect(all.decisions.map((d) => [d.date, d.outcome])).toEqual([
      ["2026-08-12", "Rejected"],
      ["2026-08-12", "Approved"],
      ["2026-02-20", "Not considered"],
      ["2025-11-02", "Withdrawn"],
    ]);
    expect(all.decisions[1]).toMatchObject({
      decidedBy: "ZCG committee",
      detail: "Zingo Labs · $125,000 requested",
      requestedUsd: 125_000,
      grantPage: "https://openzcash.org/zcg/grant?g=Zebra%20indexer",
      sources: [
        { label: "Application", href: expect.stringContaining("/issues/340") },
        { label: "Minutes", href: meetings[0].url },
      ],
    });
    expect(all.decisions[3]).toMatchObject({
      decidedBy: "Applicant",
      requestedUsd: null,
      sources: [],
    });
    expect(all.note).toContain("read_grant_application");
    expect(all).toMatchObject({
      publishedThrough: "2026-09-27",
      importedAt: "2026-09-27T03:00:00.000Z",
      totalProposals: 5,
      totalDecisions: 4,
      latestDecisionDate: "2026-08-12",
      statusCounts: {
        "zcg:Approved": 1,
        "zcg:Rejected": 1,
        "zcg:Withdrawn": 1,
        "coinholder:Filtered": 1,
        "zcg:Under review": 1,
      },
    });
    expect(all.note).toContain("D-1");
  });
  it("filters by outcome, year, program and words in English and Portuguese", () => {
    expect(
      decisionsContext(
        proposals,
        meetings,
        [],
        "Which proposals were approved in 2026?",
        meta,
      ).decisions.map((d) => d.subject),
    ).toEqual(["Zebra indexer"]);
    expect(
      decisionsContext(
        proposals,
        meetings,
        [],
        "propostas rejeitadas",
        meta,
      ).decisions.map((d) => d.subject),
    ).toEqual(["Privacy meetup"]);
    expect(
      decisionsContext(
        proposals,
        meetings,
        [],
        "coinholder decisions",
        meta,
      ).decisions.map((d) => d.process),
    ).toEqual(["coinholders"]);
    expect(
      decisionsContext(
        proposals,
        meetings,
        [],
        "what happened to the Zebra proposal",
        meta,
      ),
    ).toMatchObject({ filter: { words: ["zebra"] }, matched: 1 });
    expect(
      decisionsContext(proposals, meetings, [], "decisions in 2024", meta),
    ).toMatchObject({ matched: 0, decisions: [] });
  });
  it("does not turn an under-review row into a decision or an absent date into today", () => {
    const rows = decisionsContext(proposals, meetings, [], "", meta).decisions;
    expect(rows.some((d) => d.subject === "Pending idea")).toBe(false);
    expect(
      decisionsContext(
        [
          proposal({
            status: "withdrawn",
            decisionDate: null,
            submittedDate: null,
          }),
        ],
        [],
        [],
        "",
        meta,
      ).decisions,
    ).toEqual([]);
  });
  it("names a reader that could not be read so missing links are not taken as absent records", () => {
    const degraded = decisionsContext(proposals, [], [], "approved", {
      ...meta,
      unavailable: ["meetings"],
    });
    expect(degraded.unavailableSources).toEqual(["meetings"]);
    expect(degraded.note).toContain(
      "DEGRADED: meetings could not be read, so Minutes links are missing",
    );
    expect(
      decisionsContext(proposals, meetings, [], "", meta).unavailableSources,
    ).toEqual([]);
  });
});
