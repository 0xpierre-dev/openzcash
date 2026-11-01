import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CommunityWorkspace, WorkspaceFrame } from "@/components/community-workspace";
import { TreasuryActions } from "@/components/treasury-actions";
import { TreasuryWorkspace } from "@/components/treasury-workspace";
import { ProposalDiscussion, type DiscussionComment } from "@/components/proposal-discussion";
import type { CommunityTreasuryView } from "@/lib/domain/treasury";

const navigation = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const community = { id: "community-a", name: "Community A", slug: "community-a" };
const treasury: CommunityTreasuryView = {
  communityId: community.id, currency: "ZEC", canManage: true,
  funds: [
    { id: "fund-a", kind: "COMMUNITY", name: "Community Treasury", currency: "ZEC", availableZat: "400000001", reservedZat: "0", committedZat: "0", paidZat: "0", hasEntries: true },
    { id: "fund-b", kind: "SUSTAINABILITY", name: "Sustainability Treasury", currency: "ZEC", availableZat: "1", reservedZat: "0", committedZat: "0", paidZat: "0", hasEntries: true }
  ], recentActivity: []
};
const comments: DiscussionComment[] = [
  { id: "comment-a", parentId: null, authorLabel: "Alice", createdAt: "2026-10-08T10:00:00Z", body: "<script>alert('test')</script>", hidden: false, moderation: null },
  { id: "comment-b", parentId: "comment-a", authorLabel: "Bob", createdAt: "2026-10-08T11:00:00Z", body: null, hidden: true, moderation: { reason: "Personal information removed", moderatorLabel: "Manager", hiddenAt: "2026-10-08T12:00:00Z" } }
];
const policy = { visibility: "INVITED_PARTICIPANTS" as const, immutable: true as const, maxLength: 4000, readOnly: false };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  navigation.refresh.mockClear();
  navigation.push.mockClear();
  window.history.replaceState({}, "", "/");
});

describe("Community workspace", () => {
  it("keeps public navigation and the same sign-in entry in the embedded header", () => {
    render(<WorkspaceFrame embedded community={community} communities={[community]} viewer={null} workspaceModule="proposals"><h1>Proposals</h1></WorkspaceFrame>);
    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: "Proposals" })).toHaveAttribute("href", "/participate");
    expect(header.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(header.queryByRole("link", { name: "Committee" })).not.toBeInTheDocument();
    expect(header.queryByRole("link", { name: "DAO" })).not.toBeInTheDocument();
  });
  it("shows the authorized committee entry and highlights the active workspace", () => {
    render(<WorkspaceFrame embedded embeddedSection="committee" community={community} communities={[community]} viewer={{ nick: "reviewer", role: "VISITOR", canEditProfile: false, committeeEntry: { label: "Committee workspace", href: "/participate/committee" } }} workspaceModule="proposals"><h1>Committee workspace</h1></WorkspaceFrame>);
    const navigation = within(screen.getByRole("navigation", { name: "Participation navigation" }));
    expect(navigation.getByRole("link", { name: "Committee" })).toHaveAttribute("aria-current", "page");
    expect(navigation.getByRole("link", { name: "Proposals" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Account settings" })).toBeInTheDocument();
  });
  it("keeps decision history in the same workspace with account and theme controls", () => {
    render(<WorkspaceFrame embedded embeddedSection="history" community={community} communities={[community]} viewer={null} workspaceModule="proposals"><p>Source register</p></WorkspaceFrame>);
    const navigation = within(screen.getByRole("navigation", { name: "Participation navigation" }));
    expect(navigation.getByRole("link", { name: "Decision history" })).toHaveAttribute("href", "/participate?view=history");
    expect(navigation.getByRole("link", { name: "Decision history" })).toHaveAttribute("aria-current", "page");
    expect(navigation.getByRole("link", { name: "Proposals" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle light and dark mode" })).toBeInTheDocument();
  });
  it("keeps embedded Credits in the profile menu without a duplicate heading or shortcut", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ profile: { nick: "maya.preview", displayName: "Maya", avatarUrl: null, shareProfileInDiscussion: true } }) }));
    render(<WorkspaceFrame embedded community={community} communities={[community]} viewer={{ nick: "maya.preview", role: "VISITOR" }} workspaceModule="proposals"><h1>Proposals</h1></WorkspaceFrame>);
    const header = screen.getByRole("banner");
    expect(within(header).queryByText("Public proposals")).not.toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: "Credits" })).not.toBeInTheDocument();
    await screen.findByText("Maya");
    fireEvent.click(screen.getByRole("button", { name: "Account settings" }));
    expect(within(header).getByRole("button", { name: "Profile" })).toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: "Credits" })).not.toBeInTheDocument();
  });
  it("shows dollar budgets payable in ZEC and preserves legacy ZEC requests", () => {
    const common = { status: "OPEN", createdAt: "2026-10-08T10:00:00Z", opensAt: "2026-10-08T10:00:00Z", closesAt: "2026-10-16T10:00:00Z", commentCount: null };
    render(<CommunityWorkspace community={community} communities={[community]} viewer={null} treasury={null} memberCount={null} proposals={[
      { ...common, id: "usd", question: "USD budget", requestedAmountUsdCents: "123456" },
      { ...common, id: "legacy", question: "Legacy budget", requestedAmountZat: "2400000000" }
    ]} />);
    expect(screen.getByRole("link", { name: "$1,234.56 USD requested. Payable in ZEC at the payment-day rate." })).toHaveTextContent("$1,234.56 USD");
    expect(screen.getByText("Payable in ZEC")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "24 ZEC requested" })).toHaveTextContent("24 ZEC");
    expect(screen.queryByText("$24.00 USD")).not.toBeInTheDocument();
  });
  it("opens public proposals with an inline sign-in and no administrative controls or private data", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CommunityWorkspace community={community} communities={[community]} viewer={null} treasury={null} memberCount={null} proposals={[
      { id: "published", question: "A public community initiative", status: "OPEN", createdAt: "2026-10-08T10:00:00Z", opensAt: "2026-10-08T10:00:00Z", closesAt: "2026-10-16T10:00:00Z", commentCount: null }
    ]} />);
    expect(screen.getByRole("link", { name: "A public community initiative" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /New proposal/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Members" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Treasury" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Coinholder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Draft" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Community and treasury information")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Discussion on A public community initiative" })).toHaveTextContent("Discussion");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an authenticated visitor out of leader navigation", () => {
    render(<WorkspaceFrame community={community} communities={[community]} viewer={{ nick: "visitor", role: "VISITOR", canEditProfile: false }}><h1>Public proposals</h1></WorkspaceFrame>);
    expect(screen.getByRole("link", { name: "Proposals" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Coinholder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Members" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Treasury" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account settings" })).toBeInTheDocument();
  });

  it("shows proposal topics separately from voting status and searches their displayed labels", () => {
    const common = { createdAt: "2026-10-08T10:00:00Z", opensAt: "2026-10-09T10:00:00Z", closesAt: "2026-10-16T10:00:00Z", commentCount: 0 };
    render(<CommunityWorkspace community={community} communities={[community]} viewer={{ nick: "Owner", role: "OWNER" }} treasury={treasury} memberCount={3} proposals={[
      { ...common, id: "review", question: "Audit the payment verifier", status: "DRAFT", tags: ["security", "research"] },
      { ...common, id: "workshop", question: "Run a local learning program", status: "OPEN", tags: ["education", "community"] },
      { ...common, id: "closed-workshop", question: "Publish the previous training report", status: "CLOSED", tags: ["education"] },
      { ...common, id: "legacy", question: "A proposal without topic metadata", status: "DRAFT" }
    ]} />);
    const review = screen.getByRole("link", { name: "Audit the payment verifier" }).closest("li")!;
    const topics = within(review).getByRole("list", { name: "Proposal tags" });
    expect(within(topics).getByText("Security")).toBeInTheDocument();
    expect(within(topics).getByText("Research & development")).toBeInTheDocument();
    expect(within(topics).queryByText("Draft")).not.toBeInTheDocument();
    expect(within(review).getByText("Draft")).toBeInTheDocument();
    const legacy = screen.getByRole("link", { name: "A proposal without topic metadata" }).closest("li")!;
    expect(within(legacy).queryByRole("list", { name: "Proposal tags" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  DEVELOPMENT  " } });
    expect(screen.getByRole("link", { name: "Audit the payment verifier" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Run a local learning program" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "education" } });
    expect(screen.getByRole("link", { name: "Run a local learning program" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Publish the previous training report" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "In progress" }));
    expect(screen.getByRole("link", { name: "Run a local learning program" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Publish the previous training report" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "security" } });
    expect(screen.getByText("No matching proposals.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All 4" }));
    expect(screen.getByRole("link", { name: "Audit the payment verifier" })).toBeInTheDocument();
  });

  it("keeps simulated outcomes stable through filtering and confined to the named sample workspace", () => {
    const sampleCommunity = { ...community, id: "preview_orchard" };
    const proposals = ["First", "Second", "Third", "Fourth"].map((name, index) => ({
      id: `sample-${index}`, question: `${name} example`, status: "DRAFT",
      createdAt: "2026-10-08T10:00:00Z", opensAt: "2026-10-09T10:00:00Z", closesAt: "2026-10-16T10:00:00Z", commentCount: 0
    }));
    const props = { community: sampleCommunity, communities: [sampleCommunity], viewer: { nick: "Owner", role: "OWNER" as const }, treasury, memberCount: 12, proposals };
    const view = render(<CommunityWorkspace {...props} isDemo />);
    expect(screen.getAllByRole("img", { name: /^Simulated vote/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Closed" }));
    expect(screen.getByRole("img", { name: /^Simulated vote approved/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Simulated vote rejected/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Third example" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "In progress" }));
    expect(screen.getByRole("link", { name: "Third example" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Simulated vote ongoing/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All 4" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Second" } });
    expect(screen.getByRole("img", { name: /^Simulated vote rejected/ })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    view.rerender(<CommunityWorkspace {...props} isDemo={false} />);
    expect(screen.queryByRole("img", { name: /^Simulated vote/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Draft", { selector: ".dao-status" })).toHaveLength(4);
    view.rerender(<CommunityWorkspace {...props} community={community} isDemo />);
    expect(screen.queryByRole("img", { name: /^Simulated vote/ })).not.toBeInTheDocument();
    expect(proposals.every(proposal => proposal.status === "DRAFT")).toBe(true);
  });

  it("separates public Proposals from DAO navigation and removes the temporary name", () => {
    const view = render(<WorkspaceFrame community={community} communities={[community]} viewer={{ nick: "Owner", role: "OWNER" }} workspaceModule="proposals"><h1>Public proposals</h1></WorkspaceFrame>);
    expect(screen.getByRole("link", { name: "Proposals" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "DAO" })).toHaveAttribute("href", "/communities/community-a/dao");
    expect(screen.queryByRole("navigation", { name: "DAO navigation" })).not.toBeInTheDocument();
    expect(screen.queryByText("Voice")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Proposals home" })).toHaveAttribute("href", "/communities/community-a");
    view.rerender(<WorkspaceFrame community={community} communities={[community]} viewer={{ nick: "Owner", role: "OWNER" }} activeSection="treasury"><h1>DAO treasury</h1></WorkspaceFrame>);
    expect(screen.getByRole("link", { name: "DAO" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Treasury" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Decisions" })).toHaveAttribute("href", "/communities/community-a/dao");
    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    view.rerender(<WorkspaceFrame community={community} communities={[community]} viewer={{ nick: "Invited member", role: "PARTICIPANT" }}><h1>Invitation proposal</h1></WorkspaceFrame>);
    expect(screen.getByRole("link", { name: "Poll board" })).toHaveAttribute("aria-current", "page");
  });

  it.each(["OWNER", "MANAGER"] as const)("links %s navigation to the dedicated Treasury page without Coinholder", role => {
    render(<WorkspaceFrame community={community} communities={[community]} viewer={{ nick: "Community leader", role }} activeSection="treasury"><h1>Treasury</h1></WorkspaceFrame>);
    expect(screen.queryByRole("link", { name: "Coinholder" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Treasury" })).toHaveAttribute("href", "/communities/community-a/treasury");
    expect(screen.getByRole("link", { name: "Treasury" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Proposals" })).not.toHaveAttribute("aria-current");
  });

  it("keeps participant navigation separate from community administrative access", () => {
    render(<WorkspaceFrame community={community} communities={[community]} viewer={{ nick: "Invited member", role: "PARTICIPANT" }} activeSection="proposals"><h1>Invitation proposal</h1></WorkspaceFrame>);
    expect(screen.queryByRole("button", { name: /Community \/ DAO/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Coinholder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Treasury" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Members" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Poll board" })).toHaveAttribute("href", "/polls");
    expect(screen.queryByText("Sample data")).not.toBeInTheDocument();
  });

  it("preserves exact balances and hides budget mutations from managers", () => {
    render(<CommunityWorkspace community={community} communities={[community]} viewer={{ nick: "Manager", role: "MANAGER" }} treasury={treasury} memberCount={2} isDemo proposals={[
      { id: "draft", question: "First initiative", status: "DRAFT", createdAt: "2026-10-08T10:00:00Z", opensAt: "2026-10-09T10:00:00Z", closesAt: "2026-10-16T10:00:00Z", commentCount: 0 },
      { id: "open", question: "Second initiative", status: "OPEN", createdAt: "2026-10-08T10:00:00Z", opensAt: "2026-10-08T10:00:00Z", closesAt: "2026-10-16T10:00:00Z", commentCount: 1 }
    ]} />);
    expect(screen.getByText("4.00000001")).toBeInTheDocument();
    expect(screen.getByText("0.00000001")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record funding" })).not.toBeInTheDocument();
    expect(screen.queryByText("Sample data")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "In progress" }));
    expect(screen.queryByRole("link", { name: "First initiative" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Second initiative" })).toHaveAttribute("href", "/communities/community-a/proposals/open");
  });

  it("retries interrupted funding with the same key and an exact decimal payload", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("Disconnected")).mockResolvedValueOnce({ ok: true, json: async () => ({ treasuries: treasury, replayed: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const onUpdated = vi.fn();
    render(<TreasuryActions communityId={community.id} treasuryKind="COMMUNITY" canManage onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole("button", { name: "Record funding" }));
    fireEvent.change(screen.getByLabelText("Amount in ZEC"), { target: { value: "0.12345678" } });
    fireEvent.change(screen.getByLabelText("Funding source"), { target: { value: "Community contribution" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Support for community work" } });
    fireEvent.click(screen.getByRole("button", { name: "Record funding" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Record funding" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(treasury));
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second).toEqual(first);
    expect(first.amountZec).toBe("0.12345678");
    expect(first.treasuryKind).toBe("COMMUNITY");
    expect(first.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/communities/community-a/treasuries/funding");
  });
});

describe("Treasury workspace", () => {
  it("preserves both fund balances to the zatoshi and keeps manager access read only", () => {
    render(<TreasuryWorkspace community={community} communities={[community]} viewer={{ nick: "Manager", role: "MANAGER" }} treasury={treasury} />);
    expect(screen.getByRole("heading", { level: 1, name: "Treasury" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Treasury" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("4.00000001")).toBeInTheDocument();
    expect(screen.getByText("0.00000001")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record funding/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Allocate budget/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Combined available budget" })).getByText("4.00000002")).toBeInTheDocument();
  });

  it("lets an authorized owner open funding and allocation forms for each fund", () => {
    render(<TreasuryWorkspace community={community} communities={[community]} viewer={{ nick: "Owner", role: "OWNER" }} treasury={treasury} />);
    const funding = screen.getAllByRole("button", { name: /Record funding/ });
    const allocations = screen.getAllByRole("button", { name: /Allocate budget/ });
    expect(funding).toHaveLength(2);
    expect(allocations).toHaveLength(2);
    fireEvent.click(funding[0]);
    expect(screen.getByLabelText("Amount in ZEC")).toBeInTheDocument();
    expect(screen.getByLabelText("Funding source")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Allocate budget/ })[0]);
    expect(screen.getByRole("heading", { name: "Allocate to sustainability" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Funding source")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Reason")).toBeInTheDocument();
  });

  it("honors the server's read-only permission even for an owner", () => {
    render(<TreasuryWorkspace community={community} communities={[community]} viewer={{ nick: "Owner", role: "OWNER" }} treasury={{ ...treasury, canManage: false }} />);
    expect(screen.queryByRole("button", { name: /Record funding/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Allocate budget/ })).not.toBeInTheDocument();
  });

  it("shows funding sources and allocation direction alongside their recorded reason", () => {
    const withActivity: CommunityTreasuryView = { ...treasury, recentActivity: [
      { id: "allocation", kind: "ALLOCATION", amountZat: "12345678", fromTreasuryKind: "COMMUNITY", toTreasuryKind: "SUSTAINABILITY", fundingSource: null, reason: "Cover next month's recurring costs", actorLabel: "Owner", createdAt: "2026-10-09T12:30:00Z" },
      { id: "funding", kind: "FUNDING", amountZat: "200000001", fromTreasuryKind: null, toTreasuryKind: "COMMUNITY", fundingSource: "Community donations", reason: "Support the next workshop", actorLabel: "Owner", createdAt: "2026-10-08T10:00:00Z" }
    ] };
    render(<TreasuryWorkspace community={community} communities={[community]} viewer={{ nick: "Manager", role: "MANAGER" }} treasury={withActivity} />);
    const history = within(screen.getByRole("region", { name: "Recent activity" }));
    const entries = history.getAllByRole("listitem");
    expect(entries).toHaveLength(2);
    expect(within(entries[0]).getByText("Community → Sustainability")).toBeInTheDocument();
    expect(within(entries[0]).getByText("Cover next month's recurring costs")).toBeInTheDocument();
    expect(within(entries[0]).getByText("0.12345678")).toBeInTheDocument();
    expect(entries[0].querySelector("time")).toHaveAttribute("datetime", "2026-10-09T12:30:00Z");
    expect(within(entries[1]).getByText("Community · Community donations")).toBeInTheDocument();
    expect(within(entries[1]).getByText("Support the next workshop")).toBeInTheDocument();
    expect(within(entries[1]).getByText("2.00000001")).toBeInTheDocument();
  });
});

describe("Proposal discussion", () => {
  it("renders plain text and retained moderation records without exposing a hidden body", () => {
    const { container } = render(<ProposalDiscussion pollId="poll-a" initialComments={comments} capabilities={{ canPost: false, canModerate: false }} policy={policy} />);
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("<script>alert('test')</script>")).toBeInTheDocument();
    expect(screen.getByText("Comment hidden by a moderator")).toBeInTheDocument();
    expect(screen.getByText("Personal information removed")).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reply/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Moderate/ })).not.toBeInTheDocument();
  });

  it("does not show posting or moderation in a read-only discussion", () => {
    render(<ProposalDiscussion pollId="poll-a" initialComments={comments} capabilities={{ canPost: true, canModerate: true }} policy={{ ...policy, readOnly: true }} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Moderate/ })).not.toBeInTheDocument();
    expect(screen.getByText("This discussion is read only.")).toBeInTheDocument();
  });

  it("does not carry an unpublished draft into a different proposal", () => {
    const capabilities = { canPost: true, canModerate: false };
    const { rerender } = render(<ProposalDiscussion pollId="poll-a" initialComments={[]} capabilities={capabilities} policy={policy} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "This draft belongs to the first proposal." } });
    rerender(<ProposalDiscussion pollId="poll-b" initialComments={[]} capabilities={capabilities} policy={policy} />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("keeps reply targets stable while a comment is being published", async () => {
    let finish: () => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => {
      finish = () => resolve({ ok: false, json: async () => ({ error: "INVALID_COMMENT_INPUT" }) });
    })));
    const thread = [comments[0], { ...comments[1], hidden: false, body: "A reply", moderation: null }];
    render(<ProposalDiscussion pollId="poll-a" initialComments={thread} capabilities={{ canPost: true, canModerate: true }} policy={policy} />);
    expect(screen.getAllByRole("button", { name: /^Reply to/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Moderate comment by Alice" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "A question for the group" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish comment" }));
    await waitFor(() => screen.getAllByRole("button", { name: /^Reply to/ }).forEach(button => expect(button).toBeDisabled()));
    finish();
    await screen.findByRole("alert");
    screen.getAllByRole("button", { name: /^Reply to/ }).forEach(button => expect(button).toBeEnabled());
  });
});
