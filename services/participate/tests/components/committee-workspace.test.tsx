import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CommitteeWorkspacePanel } from "@/components/committee-workspace";
import { committeePermissions, type CommitteeWorkspace } from "@/lib/domain/committee";
import { ZCG_PROPOSAL_EXAMPLES, ZCG_EXAMPLE_MEMBERS, summarizeZcgVotes } from "@/lib/data/zcg-proposal-examples";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/auth/passkey-client", () => ({ passkeyFetch: mocks.fetch }));
vi.mock("@/components/workspace-account", () => ({ AccountAvatar: () => <span>Avatar</span> }));
vi.mock("@/components/workspace-auth", () => ({ WorkspaceSignInButton: () => <button>Sign in</button> }));
vi.mock("@/components/signed-decision", () => ({ SignedDecision: ({ endpoint }: { endpoint: string }) => <div>Review endpoint: {endpoint}</div> }));
vi.mock("@/components/proposal-inline-details", () => ({ ProposalInlineDetails: ({ active }: { active: string | null }) => active === "discussion" ? <div>Discussion and moderation</div> : active === "record" ? <div>Proposal files</div> : null }));

const initial: CommitteeWorkspace = {
  access: "MEMBER", name: "Pilot committee", role: "OWNER", demo: false, canMutate: true, emailReady: true, permissions: committeePermissions("OWNER"),
  rules: { quorum: 5, approvalPercent: 60, durationHours: null, version: 0 }, members: [
    { id: "owner", name: "Committee owner", role: "OWNER", status: "ACTIVE", ready: true, emailVerified: true, keyCount: 1, avatar: null, email: "owner@example.test", version: 1, isMe: true },
    { id: "reviewer", name: "Test reviewer", role: "REVIEWER", status: "ACTIVE", ready: false, emailVerified: true, keyCount: 0, avatar: null, email: "reviewer@example.test", version: 1, isMe: false }
  ], invitations: [], queue: [
    { recordId: "proposal-one", hostId: "host", title: "A new public grant", revision: 2, kind: "NATIVE_PROPOSAL", state: "AWAITING_REVIEW", roundId: null, closesAt: null, signed: 0, eligible: 2, myChoice: null, myPending: false, labels: [], labelsVersion: 0 },
    { recordId: "proposal-two", hostId: "host", title: "A review waiting for me", revision: 1, kind: "NATIVE_PROPOSAL", state: "OPEN", roundId: "round", closesAt: "2026-10-11T12:00:00Z", signed: 1, eligible: 2, myChoice: null, myPending: true, labels: [], labelsVersion: 0 }
  ], history: [], historyBefore: null
};
beforeEach(() => { vi.clearAllMocks(); mocks.fetch.mockResolvedValue(initial); });
const sourceQueue: CommitteeWorkspace["queue"] = ZCG_PROPOSAL_EXAMPLES.map(sourceDecision => ({
  recordId: sourceDecision.id, hostId: "host", title: sourceDecision.title, revision: 1, kind: "HISTORICAL_SUMMARY", state: "HISTORICAL",
  roundId: null, closesAt: null, signed: 0, eligible: 1, myChoice: null, myPending: false, labels: [], labelsVersion: 0, sourceDecision
}));

it("shows the five source decisions and each published vote and comment without opening a pilot review", () => {
  render(<CommitteeWorkspacePanel initial={{ ...initial, demo: true, canMutate: false, queue: [...initial.queue, ...sourceQueue] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Source decisions" }));
  expect(screen.getAllByText("Approved")).toHaveLength(4);
  expect(screen.getAllByText("Rejected")).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: /^View source decision:/ })[0]).toHaveAccessibleName(`View source decision: ${ZCG_PROPOSAL_EXAMPLES[0].title}`);
  expect(screen.queryByText("A new public grant")).not.toBeInTheDocument();
  for (const source of ZCG_PROPOSAL_EXAMPLES) {
    const trigger = screen.getByRole("button", { name: `View source decision: ${source.title}` });
    fireEvent.click(trigger);
    const panel = within(screen.getByRole("region", { name: "Published committee decision" }));
    const counts = summarizeZcgVotes(source.votes);
    expect(panel.getByText(`${counts.supportPercent}%`)).toBeVisible();
    expect(panel.getByText(`${counts.abstain} abstain`)).toBeVisible();
    expect(panel.getByRole("link", { name: "Meeting minutes ↗" })).toHaveAttribute("href", source.minutesUrl);
    expect(panel.getByRole("link", { name: "Original proposal ↗" })).toHaveAttribute("href", source.proposalUrl);
    const rows = panel.getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    for (const [index, vote] of source.votes.entries()) {
      expect(within(rows[index]).getByRole("heading", { name: ZCG_EXAMPLE_MEMBERS[vote.memberId].name })).toBeVisible();
      expect(within(rows[index]).getByText(vote.summary)).toBeVisible();
    }
    expect(screen.queryByText(/Review endpoint:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Community" }));
    expect(screen.getByText("Discussion and moderation")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Published committee decision" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Proposal" }));
    expect(screen.getByText("Proposal files")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close review" }));
    expect(trigger).toHaveFocus();
  }
  fireEvent.click(screen.getByRole("button", { name: "Decided" }));
  expect(screen.queryByText(ZCG_PROPOSAL_EXAMPLES[0].title)).not.toBeInTheDocument();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("keeps an unavailable historical record readable without fabricating feedback or a fresh ballot", () => {
  render(<CommitteeWorkspacePanel initial={{ ...initial, queue: [{ ...sourceQueue[0], sourceDecision: null }] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Source decisions" }));
  fireEvent.click(screen.getByRole("button", { name: `View source decision: ${sourceQueue[0].title}` }));
  expect(screen.getByRole("status")).toHaveTextContent("published decision details are unavailable");
  expect(screen.queryByText(/Review endpoint:/)).not.toBeInTheDocument();
  expect(screen.queryByText("Approved")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Proposal" }));
  expect(screen.getByText("Proposal files")).toBeVisible();
});

it("keeps the private panel and invitation details out of guest and denied views", () => {
  const { rerender } = render(<CommitteeWorkspacePanel initial={{ ...initial, access: "SIGNED_OUT", members: [], queue: [] }} />);
  expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible(); expect(screen.queryByRole("button", { name: "Members" })).not.toBeInTheDocument();
  rerender(<CommitteeWorkspacePanel key="denied" initial={{ ...initial, access: "DENIED", members: [], queue: [] }} />);
  expect(screen.getByText("No committee access")).toBeVisible(); expect(screen.queryByText("owner@example.test")).not.toBeInTheDocument();
});
it("filters the work queue and opens an inline review with discussion access", () => {
  render(<CommitteeWorkspacePanel initial={initial} />);
  fireEvent.click(screen.getByRole("button", { name: "For me" }));
  expect(screen.queryByText("A new public grant")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Review A review waiting for me" }));
  expect(screen.getByText(/Review endpoint:.*proposal-two/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Discussion" })); expect(screen.getByText("Discussion and moderation")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Proposal" })); expect(screen.getByText("Proposal files")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Close review" }));
  expect(screen.queryByRole("region", { name: "Review: A review waiting for me" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review A review waiting for me" })).toHaveFocus();
});
it("requires an explicit role and creates a shareable invitation without claiming email delivery", async () => {
  mocks.fetch.mockResolvedValueOnce({ invitationId: "c755ab19-8fae-4247-aa69-27b53c2fc207" }).mockResolvedValue(initial);
  render(<CommitteeWorkspacePanel initial={initial} />); fireEvent.click(screen.getByRole("button", { name: "Members" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Invite member" }));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.test" } });
  fireEvent.change(screen.getByLabelText("Role"), { target: { value: "MODERATOR" } });
  fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
  expect(await screen.findByRole("status")).toHaveTextContent("no email has been sent");
  expect(mocks.fetch).toHaveBeenCalledWith("/api/participate/committee", { action: "invite", email: "new@example.test", role: "MODERATOR" });
  expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
});
it("shows real readiness and makes the shared demo read-only", () => {
  render(<CommitteeWorkspacePanel initial={{ ...initial, demo: true, canMutate: false, emailReady: false }} />);
  fireEvent.click(screen.getByRole("button", { name: "Members" }));
  expect(screen.getByText("Passkey needed")).toBeVisible(); fireEvent.click(screen.getByRole("button", { name: "+ Invite member" })); expect(screen.getByRole("button", { name: "Create invitation" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Manage" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Rules" }));
  expect(screen.queryByRole("button", { name: "Save defaults" })).not.toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(screen.getByText("No deadline. Result after all 5 votes.")).toBeVisible();
});
it("restricts reviewer controls and uses invitation consent and a public name", async () => {
  const { rerender } = render(<CommitteeWorkspacePanel initial={{ ...initial, role: "REVIEWER", permissions: committeePermissions("REVIEWER") }} />);
  fireEvent.click(screen.getByRole("button", { name: "Members" })); expect(screen.queryByRole("button", { name: "+ Invite member" })).not.toBeInTheDocument();
  const invitationId = "5d250684-43d6-4663-b3ac-164dbad6a307";
  rerender(<CommitteeWorkspacePanel key="invite" initial={{ ...initial, access: "INVITED", role: null, permissions: committeePermissions(null), invitations: [{ id: invitationId, email: "new@example.test", role: "REVIEWER", state: "PENDING", expiresAt: "2026-10-17T12:00:00Z", mine: true }] }} />);
  fireEvent.change(screen.getByLabelText("Public reviewer name"), { target: { value: "Public reviewer" } });
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith("/api/participate/committee", { action: "accept", invitationId, publicName: "Public reviewer", consent: true }));
});
it("explains stale access changes and preserves the form for retry", async () => {
  mocks.fetch.mockRejectedValue(new Error("COMMITTEE_REFRESH_REQUIRED"));
  render(<CommitteeWorkspacePanel initial={initial} />); fireEvent.click(screen.getByRole("button", { name: "Members" })); fireEvent.click(screen.getByRole("button", { name: "Manage" }));
  fireEvent.change(screen.getByLabelText("Access"), { target: { value: "DISABLED" } }); fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Term ended" } });
  fireEvent.click(screen.getByRole("button", { name: "Save access" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("workspace changed");
  expect(screen.getByLabelText("Reason")).toHaveValue("Term ended");
  expect(mocks.fetch).toHaveBeenCalledWith("/api/participate/committee", { action: "member", memberId: "reviewer", version: 1, role: "REVIEWER", status: "DISABLED", reason: "Term ended" });
});

it("keeps the restricted public route free of private committee content", () => {
  render(<CommitteeWorkspacePanel initial={{ ...initial, access: "RESTRICTED", canMutate: false, role: null, members: [], invitations: [], queue: [], history: [] }} />);
  expect(screen.getByRole("heading", { name: "Committee access is restricted" })).toBeVisible();
  expect(screen.queryByRole("navigation", { name: "Committee sections" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Source decisions" })).not.toBeInTheDocument();
});
