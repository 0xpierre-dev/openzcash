import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MembershipProposalForm } from "@/components/membership-proposal-form";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const members = [{ id: "member-a", nick: "Alice" }, { id: "member-b", nick: "Bob" }];
const applicant = { id: "e0ce9740-8c72-4d2c-a253-ab03b4f5e123", nick: "Carol", status: "PENDING" as const, createdAt: "2026-10-09T12:00:00.000Z", updatedAt: "2026-10-09T12:00:00.000Z", proposalId: null };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { vi.clearAllMocks(); fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

function setup() {
  render(<MembershipProposalForm communityId="alpha" members={members} requests={[applicant]} />);
  fireEvent.change(screen.getByLabelText("Membership request"), { target: { value: applicant.id } });
  fireEvent.change(screen.getByLabelText("Proposal question"), { target: { value: "Should Carol join our community?" } });
  fireEvent.change(screen.getByLabelText("Voting opens · UTC"), { target: { value: "2026-11-01T10:00" } });
  fireEvent.change(screen.getByLabelText("Voting closes · UTC"), { target: { value: "2026-11-03T10:00" } });
}
const submit = () => fireEvent.submit(screen.getByRole("button", { name: "Save proposal draft" }).closest("form")!);

it("saves a scoped account-admission draft with UTC dates and a retry key", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ pollId: "draft-a" })));
  setup(); submit();
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/communities/alpha/proposals/draft-a"));
  const data = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(data).toEqual({ operation: "propose", proposal: { requestKey: expect.any(String), question: "Should Carol join our community?", opensAt: "2026-11-01T10:00:00.000Z", closesAt: "2026-11-03T10:00:00.000Z", action: { type: "ADD_MEMBER", requestId: applicant.id } } });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/communities/alpha/membership");
  expect(screen.queryByLabelText("Signal username")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/does not change membership or send invitations/)).toBeInTheDocument();
});

it("requires an explicit active removal target and never sends add-member fields", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ pollId: "remove-a" })));
  setup(); fireEvent.click(screen.getByRole("button", { name: "Remove member" })); submit();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Member to remove")).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(screen.getByLabelText("Member to remove"), { target: { value: "member-b" } }); submit();
  await waitFor(() => expect(navigation.push).toHaveBeenCalled());
  const data = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(data.proposal.action).toEqual({ type: "REMOVE_MEMBER", targetMemberId: "member-b" });
});

it("requires a pending request and the minimum voting window before sending", () => {
  setup();
  fireEvent.change(screen.getByLabelText("Membership request"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Voting closes · UTC"), { target: { value: "2026-11-01T12:00" } }); submit();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByText("Choose a pending membership request.")).toBeInTheDocument();
  expect(screen.getByText("Allow at least 24 hours for voting.")).toBeInTheDocument();
  expect(screen.getByLabelText("Membership request")).toHaveFocus();
});

it.each([
  [409, "MEMBER_IDENTITY_CONFLICT", "already on the roster"],
  [404, "MEMBER_NOT_FOUND", "no longer active"],
  [403, "forbidden", "Sign in with your account"],
  [400, "INTERNAL_PRIVATE_MESSAGE", "could not confirm"]
])("keeps entries and explains a %s rejection", async (status, code, message) => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: code }), { status }));
  setup(); submit();
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByLabelText("Membership request")).toHaveValue(applicant.id);
  expect(screen.queryByText(code)).not.toBeInTheDocument();
  expect(navigation.push).not.toHaveBeenCalled();
});

it.each(["network", "server", "malformed-success"])("does not blindly retry an uncertain %s result", async (failure) => {
  if (failure === "network") fetchMock.mockRejectedValue(new Error("offline"));
  else fetchMock.mockResolvedValue(new Response("unparseable", { status: failure === "server" ? 500 : 200 }));
  setup(); const form = screen.getByRole("button", { name: "Save proposal draft" }).closest("form")!; submit();
  expect(await screen.findByRole("alert")).toHaveTextContent(/draft.*saved/i);
  expect(screen.getByRole("link", { name: "Check proposals" })).toHaveAttribute("href", "/communities/alpha/dao");
  fireEvent.submit(form);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Membership request")).toHaveValue(applicant.id);
});

it("blocks a second submission while the first request is in progress", () => {
  fetchMock.mockReturnValue(new Promise(() => {}));
  setup(); const form = screen.getByRole("button", { name: "Save proposal draft" }).closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Saving draft…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove member" })).toBeDisabled();
});

it("offers no reset or bypass when the active roster is empty", () => {
  render(<MembershipProposalForm communityId="alpha" members={[]} />);
  expect(screen.getByRole("heading", { name: "No active members" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save proposal draft" })).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
