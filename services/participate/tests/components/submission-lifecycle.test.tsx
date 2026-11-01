import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SubmissionLifecycleAction, AbandonmentNotice } from "@/components/submission-lifecycle";
import { EMPTY_SUBMISSION, type SubmissionDraft } from "@/lib/domain/proposal-submission";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const draft: SubmissionDraft = { id: "078b0fc7-ae08-4fbf-ac40-6224f23613b4", version: 3, contentHash: "a".repeat(64), state: "DRAFT", recordId: null, updatedAt: "2026-10-10T00:00:00Z", payload: EMPTY_SUBMISSION };
const published = { ...draft, state: "PUBLISHED_DEMO" as const, recordId: `pilot-${draft.id}` };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("keeps a draft intact on cancel and deletes only after explicit confirmation", async () => {
  const deleted = vi.fn(), fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ deletedId: draft.id }) });
  vi.stubGlobal("fetch", fetcher);
  render(<SubmissionLifecycleAction draft={draft} onDeleted={deleted} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Delete draft" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
  await screen.findByText("Draft deleted.");
  expect(fetcher.mock.calls[0][1].method).toBe("DELETE");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ id: draft.id, expectedVersion: 3, consent: true });
  expect(deleted).toHaveBeenCalledWith(draft.id);
});

it("preserves the controls and explains a stale draft rather than claiming deletion", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "DRAFT_CHANGED" }) }));
  render(<SubmissionLifecycleAction draft={draft} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("changed in another tab");
  expect(screen.queryByText("Draft deleted.")).not.toBeInTheDocument();
});

it("requires reason and consent, retries the same event key and calls it awaiting an anchor", async () => {
  const abandoned = vi.fn();
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("Connection interrupted"))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ draft: { ...published, state: "ABANDONED" } }) });
  vi.stubGlobal("fetch", fetcher);
  render(<SubmissionLifecycleAction draft={published} onAbandoned={abandoned} />);
  expect(screen.queryByRole("button", { name: "Delete draft" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Abandon proposal" }));
  const confirm = screen.getByRole("button", { name: "Confirm abandonment" });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Public reason"), { target: { value: "The delivery plan is no longer feasible." } });
  expect(confirm).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(confirm);
  await screen.findByRole("alert");
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
  await screen.findByText(/event is awaiting a Zcash anchor/);
  expect(fetcher.mock.calls[0][1].method).toBe("PATCH");
  const first = JSON.parse(fetcher.mock.calls[0][1].body), second = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(first).toMatchObject({ id: draft.id, contentHash: draft.contentHash, consent: true, reason: "The delivery plan is no longer feasible." });
  expect(first.requestKey).toBe(second.requestKey);
  expect(abandoned).toHaveBeenCalledOnce();
});

it("shows a public reason, timestamp and receipt without exposing account details", () => {
  render(<AbandonmentNotice value={{ eventId: "event", eventHash: "a".repeat(64), reason: "The author withdrew this proposal.", occurredAt: "2026-10-10T12:00:00.000Z" }} endpoint="/api/record" />);
  expect(screen.getByText("The author withdrew this proposal.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Abandonment receipt ↓" })).toHaveAttribute("href", "/api/record/activity/event?download=1");
});
