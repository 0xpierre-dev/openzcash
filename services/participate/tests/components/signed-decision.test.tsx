import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignedDecision } from "@/components/signed-decision";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), authenticate: vi.fn(), requireBrowser: vi.fn() }));
vi.mock("@/lib/auth/passkey-client", () => ({ passkeyFetch: mocks.fetch, requirePasskeyBrowser: mocks.requireBrowser, passkeyErrorMessage: (e: Error) => e.message === "NotAllowedError" ? "Passkey request cancelled." : e.message }));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: mocks.authenticate }));
vi.mock("@/lib/decisions/format", () => ({ decisionHash: async () => "frozen-hash", decisionChallenge: async () => "signed-challenge" }));
vi.mock("@/components/workspace-auth", () => ({ WorkspaceSignInButton: ({ label }: { label: string }) => <button>{label}</button> }));
const endpoint = "/api/communities/host/archives/proposal";
const round = { schema: "PARTICIPATE_DECISION_ROUND_V1", id: "round-1", proposal: { title: "A preserved proposal", revision: 1 }, closesAt: "2026-10-11T12:00:00Z", rules: { quorum: 2, approvalPercent: 67 }, members: [{ id: "voter-1", label: "Reviewer 1" }] };
const ready = { round, roundHash: "frozen-hash", tally: { outcome: "OPEN", approve: 0, reject: 0, abstain: 0, signed: 0, eligible: 3 }, canSign: true, canCreate: false, canManage: false, roster: [], ballots: [] };
const ceremony = { options: { challenge: "signed-challenge" }, ceremonyId: "ceremony-1", envelope: { choice: "APPROVE", roundHash: "frozen-hash" }, roundHash: "frozen-hash" };
beforeEach(() => { vi.resetAllMocks(); mocks.authenticate.mockResolvedValue({ signed: true }); });

it("explains a source withdrawal without exposing an open-review action or inventing a native abandonment", async () => {
  mocks.fetch.mockResolvedValue({ round: null, canManage: true, canCreate: false, roster: [], abandonment: null,
    sourceWithdrawal: { url: "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/439", checkedAt: "2026-10-10T12:00:00.000Z" } });
  render(<SignedDecision endpoint={endpoint} revision={1} initiallyOpen />);
  expect(await screen.findByText(/Withdrawn on GitHub/)).toBeVisible();
  expect(screen.getByRole("link", { name: "View source ↗" })).toHaveAttribute("href", "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/439");
  expect(screen.queryByRole("button", { name: "Open signed review" })).not.toBeInTheDocument();
  expect(screen.queryByText(/The author abandoned/)).not.toBeInTheDocument();
});

it("opens a committee review with a fixed three-of-five rule instead of an editable percentage", async () => {
  const roster = Array.from({ length: 5 }, (_, i) => ({ label: `Member ${i + 1}`, ready: true }));
  mocks.fetch.mockResolvedValue({ round: null, scopeKind: "COMMITTEE", canManage: true, canCreate: true, roster, defaults: { quorum: 1, approvalPercent: 67, durationHours: 48 } });
  render(<SignedDecision endpoint={endpoint} revision={1} initiallyOpen />);
  expect(await screen.findByText("Approvals to pass")).toBeVisible();
  expect(screen.getByText("60% of the committee · One vote per member")).toBeVisible();
  expect(screen.queryByRole("spinbutton", { name: "Approval" })).not.toBeInTheDocument();
  expect(screen.queryByRole("spinbutton", { name: "Quorum" })).not.toBeInTheDocument();
  expect(screen.queryByRole("spinbutton", { name: /Duration/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open signed review" }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(`${endpoint}/decisions`, { revision: 1, policy: "ZCG_MAJORITY" }));
});

it("waits for the other members after three approvals, without a deadline", async () => {
  const members = Array.from({ length: 5 }, (_, i) => ({ id: `member-${i}`, label: `Member ${i + 1}` }));
  mocks.fetch.mockResolvedValue({ ...ready, scopeKind: "COMMITTEE", round: { ...round, schema: "PARTICIPATE_DECISION_ROUND_V4", closesAt: null, members, rules: { quorum: 5, approvalPercent: 60 } },
    tally: { ...ready.tally, outcome: "OPEN", approve: 3, signed: 3, eligible: 5, thresholdMet: true } });
  render(<SignedDecision endpoint={endpoint} revision={1} initiallyOpen />);
  expect(await screen.findByText("Open")).toBeVisible();
  expect(screen.queryByText("Approved")).not.toBeInTheDocument();
  expect(screen.getByText(/3 of 5 approvals required · No deadline/)).toBeVisible();
  expect(screen.getByText("Waiting for 2 members. The result is published after all 5 votes.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Sign with passkey" })).toBeDisabled();
  expect(screen.queryByText(/Closes|Closed/)).not.toBeInTheDocument();
});

it("shows each member and pending seats with feedback available on demand", async () => {
  const members = Array.from({ length: 5 }, (_, i) => ({ id: `member-${i}`, label: `Member ${i + 1}` }));
  mocks.fetch.mockResolvedValue({ ...ready, canSign: false, scopeKind: "COMMITTEE", round: { ...round, schema: "PARTICIPATE_DECISION_ROUND_V3", members, rules: { quorum: 3, approvalPercent: 60 } },
    tally: { ...ready.tally, approve: 2, abstain: 1, signed: 3, eligible: 5, thresholdMet: false },
    ballots: [0, 1, 2].map(i => ({ voterId: members[i].id, choice: i === 2 ? "ABSTAIN" : "APPROVE", rationale: `Public reason from member ${i + 1}.`, recordedAt: round.closesAt })) });
  render(<SignedDecision endpoint={endpoint} revision={1} initiallyOpen />);
  expect(await screen.findByText("1 more needed")).toBeVisible();
  expect(screen.getAllByText("Pending")).toHaveLength(2);
  expect(screen.getByText("Public reason from member 1.")).not.toBeVisible();
  fireEvent.click(screen.getAllByText("Read reason")[0]);
  expect(screen.getByText("Public reason from member 1.")).toBeVisible();
  expect(screen.getByText("Open")).toBeVisible();
});

it("stays collapsed and loads the exact revision on demand", async () => {
  mocks.fetch.mockResolvedValue({ round: null, canManage: false, roster: [] });
  render(<SignedDecision endpoint={endpoint} revision={2} />);
  expect(mocks.fetch).not.toHaveBeenCalled(); fireEvent.click(screen.getByText("Signed review"));
  await screen.findByText(/No signed review for this revision/);
  expect(mocks.fetch).toHaveBeenCalledWith(`${endpoint}/decisions?revision=2`, undefined, "GET");
  fireEvent.click(screen.getByText("Signed review")); await waitFor(() => expect(screen.queryByText(/No signed review/)).not.toBeInTheDocument());
});
it("shows all reviewers and blocks opening while one is missing a passkey", async () => {
  mocks.fetch.mockResolvedValue({ round: null, canManage: true, canCreate: false, roster: [{ label: "Reviewer 1", ready: true }, { label: "Reviewer 2", ready: false }] });
  render(<SignedDecision endpoint={endpoint} revision={1} />); fireEvent.click(screen.getByText("Signed review"));
  await screen.findByText("2 reviewers"); expect(screen.getByRole("button", { name: "Open signed review" })).toBeDisabled();
  fireEvent.click(screen.getByText("Reviewer readiness")); expect(screen.getByText(/Reviewer 2 · Verified email/)).toBeVisible();
});
it("requires an explicit choice and only submits after the device assertion", async () => {
  mocks.fetch.mockResolvedValueOnce(ready).mockResolvedValueOnce(ceremony).mockResolvedValueOnce({}).mockResolvedValue({ ...ready, canSign: false, myChoice: "APPROVE" });
  render(<SignedDecision endpoint={endpoint} revision={1} />); fireEvent.click(screen.getByText("Signed review"));
  const sign = await screen.findByRole("button", { name: "Sign with passkey" }); expect(sign).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Approve" })); fireEvent.click(sign);
  await screen.findByText(/You signed:/);
  expect(mocks.authenticate).toHaveBeenCalledWith({ optionsJSON: ceremony.options });
  expect(mocks.fetch).toHaveBeenCalledWith(`${endpoint}/decisions/round-1`, { action: "sign", ceremonyId: "ceremony-1", credential: { signed: true } });
  expect(screen.getByText("Open")).toBeVisible();
});
it("does not request a signature when the server changes the choice", async () => {
  mocks.fetch.mockResolvedValueOnce(ready).mockResolvedValue({ ...ceremony, envelope: { ...ceremony.envelope, choice: "REJECT" } });
  render(<SignedDecision endpoint={endpoint} revision={1} />); fireEvent.click(screen.getByText("Signed review"));
  await screen.findByRole("radio", { name: "Approve" }); fireEvent.click(screen.getByRole("radio", { name: "Approve" })); fireEvent.click(screen.getByRole("button", { name: "Sign with passkey" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("record changed"); expect(mocks.authenticate).not.toHaveBeenCalled();
});
it("leaves a cancelled device request retryable without sending a ballot", async () => {
  mocks.fetch.mockResolvedValueOnce(ready).mockResolvedValue(ceremony); mocks.authenticate.mockRejectedValue(new Error("NotAllowedError"));
  render(<SignedDecision endpoint={endpoint} revision={1} />); fireEvent.click(screen.getByText("Signed review"));
  await screen.findByRole("radio", { name: "Approve" }); fireEvent.click(screen.getByRole("radio", { name: "Approve" })); fireEvent.click(screen.getByRole("button", { name: "Sign with passkey" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("cancelled");
  expect(mocks.fetch.mock.calls.filter(call => call[1]?.action === "sign")).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Sign with passkey" })).toBeEnabled();
});

it("opens directly in the committee queue and binds the exact public reason before requesting a passkey", async () => {
  const reason = "The milestones and budget support approval of this revision.";
  const next = { ...ready, round: { ...round, schema: "PARTICIPATE_DECISION_ROUND_V2" } };
  mocks.fetch.mockResolvedValueOnce(next).mockResolvedValueOnce({ ...ceremony, envelope: { ...ceremony.envelope, schema: "PARTICIPATE_DECISION_SIGNATURE_V2", rationale: reason } }).mockResolvedValueOnce({}).mockResolvedValue({ ...next, canSign: false, myChoice: "APPROVE" });
  const changed = vi.fn();
  render(<SignedDecision endpoint={endpoint} revision={1} initiallyOpen onChanged={changed} />);
  const button = await screen.findByRole("button", { name: "Sign with passkey" });
  fireEvent.click(screen.getByRole("radio", { name: "Approve" })); expect(button).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: /Public reason/ }), { target: { value: reason } });
  fireEvent.click(button); await screen.findByText(/You signed:/);
  expect(mocks.fetch).toHaveBeenCalledWith(`${endpoint}/decisions/round-1`, { action: "prepare", choice: "APPROVE", rationale: reason });
  expect(changed).toHaveBeenCalledTimes(1);
});
it("refuses a changed public reason before opening the device prompt", async () => {
  mocks.fetch.mockResolvedValueOnce({ ...ready, round: { ...round, schema: "PARTICIPATE_DECISION_ROUND_V2" } }).mockResolvedValue({ ...ceremony, envelope: { ...ceremony.envelope, rationale: "A reason changed by the server." } });
  render(<SignedDecision endpoint={endpoint} revision={1} initiallyOpen />);
  fireEvent.click(await screen.findByRole("radio", { name: "Approve" }));
  fireEvent.change(screen.getByRole("textbox", { name: /Public reason/ }), { target: { value: "My original public reason for this decision." } });
  fireEvent.click(screen.getByRole("button", { name: "Sign with passkey" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("record changed"); expect(mocks.authenticate).not.toHaveBeenCalled();
});

it("refreshes review permissions on card return while keeping the unsigned rationale", async () => {
  mocks.fetch.mockResolvedValue({ ...ready, round: { ...round, schema: "PARTICIPATE_DECISION_ROUND_V2" } });
  const { rerender } = render(<SignedDecision endpoint={endpoint} revision={1} initiallyOpen />);
  fireEvent.click(await screen.findByRole("radio", { name: "Approve" }));
  fireEvent.change(screen.getByRole("textbox", { name: /Public reason/ }), { target: { value: "Keep this unpublished review rationale." } });
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  rerender(<SignedDecision endpoint={endpoint} revision={1} initiallyOpen visible={false} />);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  rerender(<SignedDecision endpoint={endpoint} revision={1} initiallyOpen visible />);
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("textbox", { name: /Public reason/ })).toHaveValue("Keep this unpublished review rationale.");
  expect(screen.getByRole("radio", { name: "Approve" })).toBeChecked();
});
