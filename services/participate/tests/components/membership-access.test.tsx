import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MembershipAccess, MembershipRequestList } from "@/components/membership-access";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const applicant = { id: "e0ce9740-8c72-4d2c-a253-ab03b4f5e123", nick: "Carol", status: "PENDING" as const, createdAt: "2026-10-09T12:00:00Z", updatedAt: "2026-10-09T12:00:00Z", proposalId: null };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { vi.clearAllMocks(); fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());
it("opens inline sign-in for guests instead of redirecting them away", () => {
  render(<MembershipAccess communityId="alpha" signedIn={false} initial={null} />);
  expect(screen.getByRole("button", { name: "Sign in to request membership" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Request membership" })).not.toBeInTheDocument();
});
it("shows a pending request, not membership, after a successful account request", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ request: applicant })));
  render(<MembershipAccess communityId="alpha" signedIn nick="Carol" initial={{ memberStatus: null, request: null, canRequestAt: null }} />);
  fireEvent.click(screen.getByRole("button", { name: "Request membership" }));
  expect(await screen.findByRole("heading", { name: "Request received" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Not a member yet");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ operation: "request", requestId: expect.any(String) });
});
it("requires an explicit withdrawal confirmation and preserves the pending state on failure", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "REQUEST_NOT_FOUND" }), { status: 404 }));
  render(<MembershipAccess communityId="alpha" signedIn nick="Carol" initial={{ memberStatus: null, request: applicant, canRequestAt: null }} />);
  fireEvent.click(screen.getByRole("button", { name: "Withdraw request" }));
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("no longer available");
  expect(screen.getByRole("heading", { name: "Request received" })).toBeInTheDocument();
});
it("locks uncertain saves and offers a status refresh", async () => {
  fetchMock.mockRejectedValue(new Error("offline"));
  render(<MembershipAccess communityId="alpha" signedIn initial={{ memberStatus: null, request: null, canRequestAt: null }} />);
  fireEvent.click(screen.getByRole("button", { name: "Request membership" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Refresh to check");
  expect(screen.getByRole("button", { name: "Request membership" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh status" })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledOnce();
});
it("sends a confirmed decline to the selected request without admitting it", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "DECLINED" })));
  render(<MembershipRequestList communityId="alpha" requests={[applicant]} />);
  fireEvent.click(screen.getByRole("button", { name: "Decline" }));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Review for admission" })).toHaveAttribute("href", `/communities/alpha/members/change?request=${applicant.id}`);
  fireEvent.click(screen.getByRole("button", { name: "Confirm decline" }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ operation: "decline", requestId: applicant.id });
});
