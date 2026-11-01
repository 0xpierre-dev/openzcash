import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { workspace, readPublicProposal, readProposal, readDiscussion, readSession, membership, readCommunities, readTreasuries, notFound, navigation, ServiceError } = vi.hoisted(() => {
  class ServiceError extends Error {
    constructor(message: string, public status: number, public code: string) { super(message); }
  }
  return { workspace: vi.fn(), readPublicProposal: vi.fn(), readProposal: vi.fn(), readDiscussion: vi.fn(), readSession: vi.fn(), membership: vi.fn(), readCommunities: vi.fn(), readTreasuries: vi.fn(), notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }), navigation: { push: vi.fn(), refresh: vi.fn() }, ServiceError };
});
vi.mock("next/navigation", () => ({ notFound, redirect: vi.fn(() => { throw new Error("REDIRECT"); }), useRouter: () => navigation }));
vi.mock("@/lib/services/workspace", () => ({ readWorkspaceContext: workspace, readPublicProposalDetail: readPublicProposal }));
vi.mock("@/lib/services/treasuries", () => ({ readCommunityTreasuries: readTreasuries }));
vi.mock("@/lib/services/proposal-discussion", () => ({ readProposalDetail: readProposal, readProposalDiscussion: readDiscussion, ProposalDiscussionError: ServiceError }));
vi.mock("@/lib/auth/session", () => ({ readSession }));
vi.mock("@/lib/db", () => ({ db: { communityMembership: { findFirst: membership }, daoMember: { findFirst: vi.fn(async () => null) } } }));
vi.mock("@/lib/services/communities", () => ({ readManagedCommunities: readCommunities }));
vi.mock("@/components/community-workspace", () => ({ WorkspaceFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/workspace-auth", () => ({ WorkspaceSignInButton: ({ next, label }: { next: string; label: string }) => <button data-next={next}>{label}</button> }));
vi.mock("@/components/proposal-discussion", () => ({ ProposalDiscussion: () => <section aria-label="Proposal discussion" /> }));

import EditCommunityProposalPage from "@/app/communities/[communityId]/proposals/[pollId]/edit/page";
import CommunityProposalPage from "@/app/communities/[communityId]/proposals/[pollId]/page";

const session = { subjectType: "user", userId: "owner", nick: "Owner", role: "USER" };
const proposal = { id: "proposal-a", community: { id: "alpha", name: "Alpha", slug: "alpha" }, title: "First complete proposal", body: "Description of the first proposal and its specific community deliverables.", status: "DRAFT", treasury: null, requestedAmountZec: null, opensAt: "2026-11-01T10:00:00.000Z", closesAt: "2026-11-03T10:00:00.000Z", canEditDraft: true, governance: { voteModel: "SINGLE_CHOICE", quorumPercent: 40, passingThresholdPercent: 67 }, membershipChange: null };

beforeEach(() => {
  vi.clearAllMocks();
  workspace.mockResolvedValue({ session, community: proposal.community, communities: [proposal.community], viewer: { nick: "Owner", role: "OWNER" }, isDemo: false });
  readProposal.mockResolvedValue(proposal);
  readPublicProposal.mockResolvedValue(null);
  readTreasuries.mockResolvedValue({ funds: [] });
  readSession.mockResolvedValue(session);
  membership.mockResolvedValue({ role: "OWNER" });
  readCommunities.mockResolvedValue([proposal.community]);
  readDiscussion.mockResolvedValue({ comments: [], capabilities: { canPost: true, canModerate: true }, policy: { visibility: "INVITED_PARTICIPANTS", immutable: true, maxLength: 4000, readOnly: false } });
});

describe("private draft page", () => {
  it("turns missing or foreign proposal service denials into a 404 before loading treasury data", async () => {
    readProposal.mockRejectedValue(new ServiceError("Private proposal", 404, "PROPOSAL_NOT_FOUND"));
    await expect(EditCommunityProposalPage({ params: Promise.resolve({ communityId: "alpha", pollId: "foreign" }) })).rejects.toThrow("NOT_FOUND");
    expect(readProposal).toHaveBeenCalledWith("foreign", session, "alpha");
    expect(readTreasuries).not.toHaveBeenCalled();
  });

  it("does not expose a form for a proposal beyond the draft stage", async () => {
    readProposal.mockResolvedValue({ ...proposal, status: "OPEN", canEditDraft: false });
    await expect(EditCommunityProposalPage({ params: Promise.resolve({ communityId: "alpha", pollId: "proposal-a" }) })).rejects.toThrow("NOT_FOUND");
    expect(readTreasuries).not.toHaveBeenCalled();
  });

  it("does not carry unsaved proposal text into another draft during client navigation", async () => {
    readProposal.mockResolvedValue({ ...proposal, tags: ["security"] });
    const first = await EditCommunityProposalPage({ params: Promise.resolve({ communityId: "alpha", pollId: "proposal-a" }) });
    const view = render(first);
    await waitFor(() => expect(screen.getByLabelText("Voting opens")).not.toHaveValue(""));
    fireEvent.change(screen.getByLabelText("The proposal"), { target: { value: "Unsaved private content from the first draft." } });
    expect(screen.getByRole("button", { name: "Security" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Wallets" }));
    readProposal.mockResolvedValue({ ...proposal, id: "proposal-b", title: "Second complete proposal", body: "Only the second proposal content belongs in this draft form.", tags: ["education"] });
    const second = await EditCommunityProposalPage({ params: Promise.resolve({ communityId: "alpha", pollId: "proposal-b" }) });
    view.rerender(second);
    expect(screen.getByLabelText("Proposal title")).toHaveValue("Second complete proposal");
    expect(screen.getByLabelText("The proposal")).toHaveValue("Only the second proposal content belongs in this draft form.");
    expect(screen.getByRole("button", { name: "Education" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Security" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Wallets" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("community proposal detail page", () => {
  it("keeps the USD request public and administrative estimates private", async () => {
    readSession.mockResolvedValue(null);
    membership.mockResolvedValue(null);
    readPublicProposal.mockResolvedValue({ ...proposal, status: "OPEN", requestedAmountUsd: "350.00", treasury: { id: "fund", kind: "COMMUNITY", currency: "ZEC" }, canEditDraft: false });
    render(await CommunityProposalPage({ params: Promise.resolve({ communityId: "alpha", pollId: "proposal-a" }) }));
    expect(screen.getByRole("heading", { name: "$350.00 USD" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "ZEC payment estimate" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in to participate" })).toBeInTheDocument();
  });

  it("renders saved tags and structured Markdown without loading author-supplied HTML or images", async () => {
    readProposal.mockResolvedValue({ ...proposal, tags: ["education", "community"], body: [
      "# Public learning program",
      "",
      "## Milestones",
      "",
      "| Work | Budget |",
      "| --- | ---: |",
      "| Workshop | 1 ZEC |",
      "",
      "- [x] Team confirmed",
      "",
      "![Tracking image](https://tracker.example/visitor.png)",
      "",
      '<script>alert("untrusted")</script>',
      "",
      "[Unsafe destination](javascript:alert(1))"
    ].join("\n") });
    const page = await CommunityProposalPage({ params: Promise.resolve({ communityId: "alpha", pollId: "proposal-a" }) });
    const { container } = render(page);
    expect(readProposal).toHaveBeenCalledWith("proposal-a", session, "alpha");
    expect(readDiscussion).toHaveBeenCalledWith("proposal-a", session);
    expect(screen.getByRole("heading", { level: 1, name: proposal.title })).toBeInTheDocument();
    const topics = screen.getByRole("list", { name: "Proposal tags" });
    expect(within(topics).getByText("Education")).toBeInTheDocument();
    expect(within(topics).getByText("Community")).toBeInTheDocument();
    expect(within(topics).queryByText("Draft")).not.toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public learning program", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1 ZEC" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Completed item" })).toBeDisabled();
    expect(screen.getByText("Image: Tracking image")).toBeInTheDocument();
    expect(container.querySelector("script, img, iframe")).toBeNull();
    expect(screen.queryByRole("link", { name: "Unsafe destination" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Proposal discussion" })).toBeInTheDocument();
  });

  it("lets guests read published proposal content while keeping invited comments private", async () => {
    readSession.mockResolvedValue(null);
    readPublicProposal.mockResolvedValue({ ...proposal, status: "FINALIZED", canEditDraft: false });
    render(await CommunityProposalPage({ params: Promise.resolve({ communityId: "alpha", pollId: "proposal-a" }) }));
    expect(readPublicProposal).toHaveBeenCalledWith("proposal-a", "alpha");
    expect(readProposal).not.toHaveBeenCalled();
    expect(readDiscussion).not.toHaveBeenCalled();
    expect(membership).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: proposal.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in to participate" })).toHaveAttribute("data-next", "/communities/alpha/proposals/proposal-a#discussion");
    expect(screen.getByRole("region", { name: "Join the discussion" })).toHaveAttribute("id", "discussion");
    expect(screen.queryByRole("region", { name: "Proposal discussion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Voting setup/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open ballot/ })).not.toBeInTheDocument();
  });

  it("keeps a guest from opening private drafts", async () => {
    readSession.mockResolvedValue(null);
    await expect(CommunityProposalPage({ params: Promise.resolve({ communityId: "alpha", pollId: "draft" }) })).rejects.toThrow("NOT_FOUND");
    expect(readDiscussion).not.toHaveBeenCalled();
    expect(membership).not.toHaveBeenCalled();
  });

  it("does not give an authenticated outsider discussion access through the public fallback", async () => {
    readProposal.mockRejectedValue(new ServiceError("Not invited", 404, "PROPOSAL_NOT_FOUND"));
    readPublicProposal.mockResolvedValue({ ...proposal, status: "CLOSED", canEditDraft: false });
    membership.mockResolvedValue(null);
    render(await CommunityProposalPage({ params: Promise.resolve({ communityId: "alpha", pollId: "proposal-a" }) }));
    expect(readDiscussion).not.toHaveBeenCalled();
    expect(screen.getByText("Use your proposal invitation to participate.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Proposal discussion" })).not.toBeInTheDocument();
  });

  it("does not render or fetch discussion for a proposal outside the requested community", async () => {
    readProposal.mockRejectedValue(new ServiceError("Private proposal", 404, "PROPOSAL_NOT_FOUND"));
    await expect(CommunityProposalPage({ params: Promise.resolve({ communityId: "alpha", pollId: "foreign" }) })).rejects.toThrow("NOT_FOUND");
    expect(readProposal).toHaveBeenCalledWith("foreign", session, "alpha");
    expect(readDiscussion).not.toHaveBeenCalled();
    expect(membership).not.toHaveBeenCalled();
  });
});
