import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ZcgProposalExamples, ZcgVoteBar } from "@/components/zcg-proposal-examples";
import { CommunityWorkspace } from "@/components/community-workspace";
import { ZCG_PROPOSAL_EXAMPLES, summarizeZcgVotes, summarizeZcgParticipation } from "@/lib/data/zcg-proposal-examples";
import { ZCG_REVIEW_PROPOSALS } from "@/lib/data/zcg-review-proposals";
import { COMMITTEE_LABELS } from "@/lib/domain/committee-labels";
import { zcgSourceMetadata } from "@/lib/data/zcg-source-metadata";
import { githubProposalOutcome } from "@/lib/domain/zcg-source-metadata";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/proposal-zec-estimate", async importOriginal => ({
  ...await importOriginal<typeof import("@/components/proposal-zec-estimate")>(),
  useProposalZecPrice: () => ({ status: "unavailable", price: null })
}));

describe("ZCG public decision examples", () => {
  it("reveals a notification destination even after the user filtered it out", () => {
    const proposals = [...ZCG_REVIEW_PROPOSALS, ...ZCG_PROPOSAL_EXAMPLES];
    const { rerender } = render(<ZcgProposalExamples proposals={proposals} filterResetKey={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Under review" }));
    expect(screen.queryByRole("link", { name: ZCG_PROPOSAL_EXAMPLES[0].title })).not.toBeInTheDocument();
    rerender(<ZcgProposalExamples proposals={proposals} filterResetKey={1} filterTarget={{ recordId: ZCG_PROPOSAL_EXAMPLES[0].id, fallback: "under_review" }} />);
    expect(screen.getByRole("link", { name: ZCG_PROPOSAL_EXAMPLES[0].title })).toBeVisible();
    expect(screen.getByRole("button", { name: "Approved" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Under review" }));
    expect(screen.queryByRole("link", { name: ZCG_PROPOSAL_EXAMPLES[0].title })).not.toBeInTheDocument();
  });

  it("places real pending applications next to Approved without inventing votes or decisions", () => {
    render(<ZcgProposalExamples proposals={[...ZCG_REVIEW_PROPOSALS, ...ZCG_PROPOSAL_EXAMPLES]} />);
    const filters = screen.getByLabelText("Filter proposals");
    expect(within(filters).getAllByRole("button").map(button => button.textContent)).toEqual(["Under review", "Approved", "Rejected", "Abandoned"]);
    expect(within(filters).getByRole("button", { name: "Under review" })).toHaveAttribute("aria-pressed", "true");
    const pending = ZCG_REVIEW_PROPOSALS.filter(proposal => githubProposalOutcome(zcgSourceMetadata(proposal.id)!) === "under_review");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(pending.length);
    expect(screen.queryByRole("group", { name: "Committee votes and feedback" })).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^VKX Wallet: Native/ })).toHaveAttribute("href", "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/477");
    expect(screen.getByRole("group", { name: "Requested budget: $48,000 USD" })).toBeVisible();
    expect(screen.getAllByText("Awaiting committee decision")).toHaveLength(pending.length);
    fireEvent.click(within(filters).getByRole("button", { name: "Approved" }));
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
    expect(screen.queryByText("Awaiting committee decision")).not.toBeInTheDocument();
  });

  it("keeps the current official status visible and discloses workflow labels without changing their colors", () => {
    const proposal = ZCG_REVIEW_PROPOSALS[0];
    const official = COMMITTEE_LABELS.find(label => label.name === "📋 Grant Application")!;
    const annotation = COMMITTEE_LABELS.find(label => label.name === "⏰ Milestones Past Due")!;
    render(<ZcgProposalExamples proposals={[proposal]} committeeLabels={{ [proposal.id]: [official.id, annotation.id] }} />);
    const github = within(screen.getByRole("list", { name: "GitHub labels" }));
    const application = within(screen.getByLabelText("Additional GitHub labels")).getByText("📋 Grant Application");
    expect(application.style.getPropertyValue("--label-color")).toBe("#bdb853");
    expect(application).not.toBeVisible();
    const more = screen.getByText("+1 label");
    fireEvent.click(more);
    expect(application).toBeVisible();
    fireEvent.keyDown(more, { key: "Escape" });
    expect(application).not.toBeVisible();
    expect(more).toHaveFocus();
    expect(github.getByText("👀 Ready For ZCG Review")).toBeVisible();
    expect(screen.getAllByText("📋 Grant Application")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: `GitHub labels for ${proposal.title}` })).not.toBeInTheDocument();
    const sectors = within(screen.getByRole("list", { name: "Proposal sectors" }));
    expect(sectors.getByText("Education")).toHaveAttribute("title", "Applicant category on GitHub · Education");
    expect(sectors.getByText("Events")).toHaveAttribute("title", "OpenZcash sector classification");
    expect(within(screen.getByRole("list", { name: "Committee labels" })).getByText(annotation.name)).toBeVisible();
  });

  it("shows one approval label, separates support from turnout, and keeps the full budget identifiable", () => {
    render(<ZcgProposalExamples proposals={[ZCG_PROPOSAL_EXAMPLES[0]]} />);
    fireEvent.click(screen.getByRole("button", { name: "Approved" }));
    expect(screen.getByRole("group", { name: "Committee support: 80%" })).toBeVisible();
    expect(screen.getByLabelText("Committee turnout: 100%, 5 of 5 members")).toBeVisible();
    expect(screen.getByRole("group", { name: "Approved budget: $8,000.00 USD" })).toBeVisible();
    expect(screen.getAllByText("✅ Grant Approved")).toHaveLength(1);
    expect(screen.getByText("✅ Grant Approved")).toBeVisible();
    // The only standalone Approved text is the filter, not another card badge.
    expect(screen.getAllByText("Approved")).toEqual([screen.getByRole("button", { name: "Approved" })]);
    expect(screen.getAllByText("80%")).toHaveLength(1);
  });

  it("counts participation against all five seats, including abstentions, without counting a member twice", () => {
    const votes = ZCG_PROPOSAL_EXAMPLES[1].votes;
    expect(summarizeZcgParticipation(votes)).toEqual({ eligible: 5, recorded: 5, turnoutPercent: 100, supportPercent: 80 });
    const partial = [votes.find(vote => vote.vote === "approve")!, votes.find(vote => vote.vote === "abstain")!];
    expect(summarizeZcgParticipation([...partial, partial[0]])).toEqual({ eligible: 5, recorded: 2, turnoutPercent: 40, supportPercent: 20 });
    expect(summarizeZcgParticipation([])).toEqual({ eligible: 5, recorded: 0, turnoutPercent: 0, supportPercent: 0 });
  });

  it("moves a withdrawn GitHub application out of review without inventing ballots or changing the preserved capture", () => {
    render(<ZcgProposalExamples proposals={ZCG_REVIEW_PROPOSALS} />);
    fireEvent.click(screen.getByRole("button", { name: "Under review" }));
    expect(screen.queryByRole("link", { name: /^Zebra-Native/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abandoned" }));
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: /^Zebra-Native/ })).toBeVisible();
    expect(screen.getByText("Grant Withdrawn by Submitter")).toBeVisible();
    expect(screen.getByText("Withdrawn by the applicant on GitHub")).toBeVisible();
    expect(screen.queryByText("Awaiting committee decision")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Committee votes and feedback" })).not.toBeInTheDocument();
    expect(ZCG_REVIEW_PROPOSALS.find(proposal => proposal.issueNumber === 439)?.outcome).toBe("under_review");
  });

  it("reconciles all five named positions for every dated decision", () => {
    expect(ZCG_PROPOSAL_EXAMPLES).toHaveLength(5);
    expect(ZCG_PROPOSAL_EXAMPLES.map(proposal => summarizeZcgVotes(proposal.votes))).toEqual([
      { approve: 4, reject: 1, abstain: 0, total: 5, supportPercent: 80 },
      { approve: 4, reject: 0, abstain: 1, total: 5, supportPercent: 80 },
      { approve: 0, reject: 5, abstain: 0, total: 5, supportPercent: 0 },
      { approve: 5, reject: 0, abstain: 0, total: 5, supportPercent: 100 },
      { approve: 3, reject: 2, abstain: 0, total: 5, supportPercent: 60 }
    ]);
    for (const proposal of ZCG_PROPOSAL_EXAMPLES) {
      expect(new Set(proposal.votes.map(vote => vote.memberId)).size).toBe(5);
      expect(proposal.minutesUrl).toMatch(/^https:\/\/forum\.zcashcommunity\.com\/t\/.+\/\d+\/[12]$/);
      expect(proposal.votes.every(vote => vote.summary.length > 0)).toBe(true);
    }
  });

  it("keeps abstention in the denominator and does not invent a reason", () => {
    render(<ZcgVoteBar proposal={ZCG_PROPOSAL_EXAMPLES[1]} />);
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByLabelText("4 approve, 0 reject, 1 abstain")).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Paul Brigner: Abstain. Read feedback" }));
    expect(screen.getByRole("dialog", { name: "Paul Brigner's feedback" })).toHaveTextContent("no individual rationale was published");
    expect(screen.getByRole("link", { name: "Read source ↗" })).toHaveAttribute("href", ZCG_PROPOSAL_EXAMPLES[1].minutesUrl);
    expect(summarizeZcgVotes([]).supportPercent).toBeNull();
  });

  it("opens individual feedback on hover, keyboard focus or tap, and supports dismissal", () => {
    render(<ZcgVoteBar proposal={ZCG_PROPOSAL_EXAMPLES[0]} />);
    const artkor = screen.getByRole("button", { name: "Artkor: Reject. Read feedback" });
    fireEvent.mouseEnter(artkor);
    expect(screen.getByRole("dialog", { name: "Artkor's feedback" })).toHaveTextContent("prioritize privacy");
    fireEvent.keyDown(artkor, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const hanh = screen.getByRole("button", { name: "Hanh: Approve. Read feedback" });
    fireEvent.focus(hanh);
    expect(screen.getByRole("dialog", { name: "Hanh's feedback" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close feedback" }));
    expect(hanh).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(artkor);
    expect(artkor).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(artkor);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(artkor);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("filters real outcomes and preserves their members and original proposal links", () => {
    render(<ZcgProposalExamples proposals={ZCG_PROPOSAL_EXAMPLES} />);
    fireEvent.click(screen.getByRole("button", { name: "Approved" }));
    expect(screen.getAllByRole("group", { name: "Committee votes and feedback" })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Rejected" }));
    expect(screen.getByText("0%")).toBeInTheDocument();
    const title = screen.getByRole("link", { name: /^Zcash SeedSigner/ });
    expect(title).toHaveAttribute("href", ZCG_PROPOSAL_EXAMPLES[2].proposalUrl);
    expect(screen.getAllByRole("button", { name: /Reject\. Read feedback/ })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Abandoned" }));
    expect(screen.getByText("No abandoned proposals.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Committee votes and feedback" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approved" }));
    expect(screen.getByRole("link", { name: /^Zcash World, Mumbai/ })).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("keeps only one feedback card open when moving between proposals", () => {
    render(<ZcgProposalExamples proposals={ZCG_PROPOSAL_EXAMPLES} />);
    fireEvent.click(screen.getByRole("button", { name: "Approved" }));
    fireEvent.click(screen.getByRole("button", { name: "Paul Brigner: Abstain. Read feedback" }));
    expect(screen.getByRole("dialog", { name: "Paul Brigner's feedback" })).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getAllByRole("button", { name: "Hanh: Approve. Read feedback" })[0]);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Hanh's feedback" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Paul Brigner's feedback" })).not.toBeInTheDocument();
  });

  it("opens feedback above the rail when there is insufficient space below", () => {
    const bounds = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 650, 300, 80));
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(180);
    try {
      render(<ZcgVoteBar proposal={ZCG_PROPOSAL_EXAMPLES[0]} />);
      fireEvent.click(screen.getByRole("button", { name: "Artkor: Reject. Read feedback" }));
      expect(screen.getByRole("dialog")).toHaveAttribute("data-placement", "above");
      bounds.mockReturnValue(new DOMRect(0, 100, 300, 80));
      fireEvent(window, new Event("resize"));
      expect(screen.getByRole("dialog")).toHaveAttribute("data-placement", "below");
    } finally {
      bounds.mockRestore(); height.mockRestore();
    }
  });

  it("isolates historical examples from DAO records, balances and draft outcomes", () => {
    const community = { id: "preview_orchard", name: "Orchard", slug: "orchard" };
    const props = {
      community, communities: [community], viewer: { nick: "Owner", role: "OWNER" as const }, treasury: null, memberCount: 12, isDemo: false,
      proposals: [{ id: "draft", question: "Our real DAO draft", status: "DRAFT", createdAt: "2026-10-09T10:00:00Z", opensAt: "2026-10-12T10:00:00Z", closesAt: "2026-10-14T10:00:00Z", commentCount: 0 }]
    };
    const view = render(<CommunityWorkspace {...props} />);
    const draft = screen.getByRole("link", { name: "Our real DAO draft" }).closest("li")!;
    expect(within(draft).getByText("Draft")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^Simulated vote/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Committee votes and feedback" })).not.toBeInTheDocument();
    view.rerender(<CommunityWorkspace {...props} isDemo={false} />);
    expect(screen.queryByRole("button", { name: "ZCG examples" })).not.toBeInTheDocument();
    view.rerender(<CommunityWorkspace {...props} community={{ ...community, id: "another-dao" }} />);
    expect(screen.queryByRole("button", { name: "ZCG examples" })).not.toBeInTheDocument();
  });
});
