import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ArchiveActivity } from "@/components/archive-activity";
const endpoint = "/api/communities/community-a/archives/record-a";
const item = { id: "event-a", sequence: 1, label: "Proposal liked", origin: "LIVE", occurredAt: "2026-10-10T00:00:00Z", recordedAt: "2026-10-10T00:00:00Z", eventHash: "a".repeat(64), state: "RECORDED", stateLabel: "Recorded · Not anchored", actor: "Participant 12345678" };
const response = (items = [item], nextBefore: number | null = null) => ({ ok: true, json: async () => ({ items, nextBefore }) });
afterEach(() => vi.unstubAllGlobals());
it("shows dated block evidence without treating a confirming transaction as verified", async () => {
  const chain = { network: "mainnet", txid: "b".repeat(64), blockHeight: 3512635, blockTime: item.occurredAt,
    confirmations: 2, requiredConfirmations: 10, checkedAt: item.recordedAt };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ ...item, state: "CONFIRMING", stateLabel: "Confirming", chain }], nextBefore: null }) }));
  render(<ArchiveActivity endpoint={endpoint} />);
  fireEvent.click(screen.getByText("Activity & verification")); await screen.findByText("Confirming");
  expect(screen.queryByText("Verified at last check")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Verify"));
  expect(screen.getByText(chain.txid)).toBeVisible();
  expect(screen.getByText(/Block 3,512,635/)).toBeVisible();
  expect(screen.getByText(/2 confirmations \(10 required\)/)).toBeVisible();
});
it("loads only when expanded and distinguishes recorded events from chain proofs", async () => {
  const fetcher = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetcher);
  render(<ArchiveActivity endpoint={endpoint} />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Activity & verification"));
  await screen.findByText("Proposal liked");
  expect(screen.getByText("Recorded · Not anchored")).toBeVisible();
  expect(screen.getByRole("link", { name: "Receipt ↓" })).toHaveAttribute("href", `${endpoint}/activity/event-a?download=1`);
  expect(screen.getByText(item.eventHash)).not.toBeVisible();
  fireEvent.click(screen.getByText("Verify"));
  expect(screen.getByText(item.eventHash)).toBeVisible();
  fireEvent.click(screen.getByText("Activity & verification"));
  await waitFor(() => expect(screen.queryByText("Proposal liked")).not.toBeInTheDocument());
});
it("refreshes after a committee-scoped action and replaces stale verification", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response([{ ...item, state: "VERIFIED", stateLabel: "Verified at last check" }])).mockResolvedValue(response([{ ...item, state: "CHECK_REQUIRED", stateLabel: "Check required" }]));
  vi.stubGlobal("fetch", fetcher); render(<ArchiveActivity endpoint={endpoint} />);
  fireEvent.click(screen.getByText("Activity & verification")); await screen.findByText("Verified at last check");
  await act(async () => { window.dispatchEvent(new CustomEvent("dao:participation-updated", { detail: { communityId: "separate-committee-scope" } })); });
  await screen.findByText("Check required"); expect(screen.queryByText("Verified at last check")).not.toBeInTheDocument();
});
it("keeps failures actionable and paginates on the same page", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response([item], 2)).mockResolvedValue(response([{ ...item, id: "event-b", sequence: 2, label: "Comment published" }]));
  vi.stubGlobal("fetch", fetcher); render(<ArchiveActivity endpoint={endpoint} />);
  fireEvent.click(screen.getByText("Activity & verification")); await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); await screen.findByText("Proposal liked");
  fireEvent.click(screen.getByRole("button", { name: "Earlier activity ↓" })); await screen.findByText("Comment published");
  expect(fetcher).toHaveBeenLastCalledWith(`${endpoint}/activity?before=2`, { cache: "no-store" });
  expect(screen.getByText("Proposal liked")).toBeVisible();
});

it("pauses hidden activity updates and refreshes when its card becomes visible again", async () => {
  const fetcher = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(<ArchiveActivity endpoint={endpoint} initiallyOpen />);
  await screen.findByText("Proposal liked");
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Verify"));
  rerender(<ArchiveActivity endpoint={endpoint} initiallyOpen visible={false} />);
  await act(async () => { window.dispatchEvent(new CustomEvent("dao:participation-updated")); });
  expect(fetcher).toHaveBeenCalledTimes(1);
  rerender(<ArchiveActivity endpoint={endpoint} initiallyOpen visible />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(screen.getByText(item.eventHash)).toBeVisible();
});
