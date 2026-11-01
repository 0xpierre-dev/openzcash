import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProposalCollectionCheck } from "@/components/proposal-collection-check";
import type { CollectionCheckHistory, CollectionCheckView } from "@/lib/domain/poll-collection";
const fetcher = vi.fn();
const history: CollectionCheckHistory = { canCheck: true, checks: [], finalization: "POLICY_AND_CUTOFF_REQUIRED" };
const check: CollectionCheckView = { id: "check-1", status: "OBSERVED", reason: null, startedAt: "2026-01-01T12:00:00Z", finishedAt: "2026-01-01T12:00:02Z", leaseExpiresAt: "2026-01-01T12:01:00Z", network: "regtest", tipHeight: 1000, scannedHeight: 1000, transactionCount: 15, outputCount: 20, evidenceHash: "a".repeat(64) };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { vi.stubGlobal("fetch", fetcher); fetcher.mockReset(); });
afterEach(() => vi.unstubAllGlobals());
describe("proposal verification panel", () => {
  it("records a wallet check while keeping the tally pending", async () => {
    fetcher.mockResolvedValueOnce(json(history)).mockResolvedValueOnce(json({ check }));
    render(<ProposalCollectionCheck communityId="dao-a" pollId="poll-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Check collection" }));
    await screen.findByText("Wallet snapshot recorded");
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText(/Voting rules and a verified cutoff/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Verification details"));
    expect(screen.getByText("Ballot outputs")).toBeInTheDocument(); expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Finalize/ })).not.toBeInTheDocument();
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ requestKey: expect.any(String) });
  });
  it("shows unconfigured sources truthfully, with a timestamp and retry cooldown", async () => {
    fetcher.mockResolvedValueOnce(json(history)).mockResolvedValueOnce(json({ check: { ...check, status: "BLOCKED", reason: "NOT_CONFIGURED", leaseExpiresAt: new Date(Date.now() + 60000).toISOString() } }));
    render(<ProposalCollectionCheck communityId="dao-a" pollId="poll-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Check collection" }));
    await screen.findByText(/Connect the voting collector/);
    expect(screen.getByRole("button", { name: "Check again shortly" })).toBeDisabled();
    expect(screen.getByText(/Last check/)).toBeInTheDocument();
  });
  it("reuses the same request key after an uncertain network failure", async () => {
    fetcher.mockResolvedValueOnce(json(history)).mockRejectedValueOnce(new Error("Connection interrupted")).mockResolvedValueOnce(json({ check }));
    render(<ProposalCollectionCheck communityId="dao-a" pollId="poll-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Check collection" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Check collection" }));
    await screen.findByText("Wallet snapshot recorded");
    expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);
  });
  it("offers recovery for expired workers and never claims that the check finished", async () => {
    fetcher.mockResolvedValue(json({ ...history, checks: [{ ...check, status: "RUNNING", finishedAt: null }] }));
    render(<ProposalCollectionCheck communityId="dao-a" pollId="poll-a" />);
    await screen.findByText(/check was interrupted/);
    expect(screen.getByRole("button", { name: "Check collection" })).toBeEnabled();
    expect(screen.queryByText("Wallet snapshot recorded")).not.toBeInTheDocument();
  });
  it("offers reload after a failed initial read and hides actions for read-only rounds", async () => {
    fetcher.mockResolvedValueOnce(json({ message: "Proposal not found" }, 404));
    const view = render(<ProposalCollectionCheck communityId="dao-a" pollId="poll-a" />);
    await screen.findByRole("button", { name: "Reload proposal" });
    view.unmount(); fetcher.mockResolvedValueOnce(json({ ...history, canCheck: false }));
    render(<ProposalCollectionCheck communityId="dao-a" pollId="poll-b" />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Check collection" })).not.toBeInTheDocument();
  });
});
