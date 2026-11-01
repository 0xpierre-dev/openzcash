import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CoinholderWorkspace } from "@/components/coinholder-dashboard";
import raw from "@/data/coinholder/q3-2026-summary.json";
import revealArchive from "@/data/coinholder/q3-2026-reveals.json";
import { parseCoinholderRevealHistory } from "@/lib/domain/coinholder-reveals";
import metadata from "@/data/coinholder/q3-2026-metadata.json";
import { buildCoinholderDashboard, COINHOLDER_ROUND_ID, type CoinholderActivity, type CoinholderDashboard } from "@/lib/domain/coinholder";

vi.mock("@/components/community-workspace", () => ({ WorkspaceFrame: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
const revealHistory = parseCoinholderRevealHistory(revealArchive, raw);
const START = Date.parse("2026-10-09T04:00:00.000Z");
const community = { id: "community-a", name: "Community A", slug: "community-a" };
const frame = { community, communities: [community], viewer: { nick: "Owner", role: "OWNER" as const } };

/** UI-only synthetic transactions; final proposal weights below use the real Q3 fixture. */
function activityFixture(): CoinholderActivity {
  const records = Array.from({ length: 12 }, (_, index) => {
    const txHash = (index + 1).toString(16).padStart(64, "0").toUpperCase();
    const proposal = index % 2 + 1;
    return {
      txHash, height: 100 + index, at: `2026-09-20T10:${String(index).padStart(2, "0")}:20.000Z`, kind: "MsgCastVote", typeUrl: "/svote.v1.MsgCastVote", proposalIds: [proposal], castCount: 1, txBytes: 1024,
      sourceUrl: `https://zvote.zfnd.org/shielded-vote/v1/tx/${txHash}`,
      messages: [{ typeUrl: "/svote.v1.MsgCastVote", proposalId: proposal, commitment: String(index + 1).padStart(64, "0"), anchorHeight: 99, proofBytes: 512 }]
    };
  });
  return {
    schemaVersion: 1, roundId: COINHOLDER_ROUND_ID, chainId: "test-chain", fetchedAt: new Date(START).toISOString(), sourceUrls: [], unit: "Encrypted vote commitments", complete: true,
    coverage: { fromHeight: 1, toHeight: 200, firstAt: records[0].at, lastAt: records[11].at }, totals: { transactions: 12, castMessages: 12 },
    minutes: records.map((record, index) => ({ at: record.at.replace(":20.000Z", ":00Z"), count: 1, cumulative: index + 1 })),
    hours: [{ at: "2026-09-20T10:00:00Z", count: 12, cumulative: 12 }],
    proposals: [1, 2].map(id => ({ id, transactions: 6, castMessages: 6, hours: [{ at: "2026-09-20T10:00:00Z", count: 6, cumulative: 6 }], minutes: records.filter(record => record.proposalIds.includes(id)).map((record, index) => ({ at: record.at.replace(":20.000Z", ":00Z"), count: 1, cumulative: index + 1 })) })),
    recentTransactions: records.slice(-2), transactions: records, evidence: {}
  };
}
function dashboard(): CoinholderDashboard {
  return buildCoinholderDashboard(raw, metadata, {
    state: "verified", checkedAt: new Date(START).toISOString(), snapshotFetchedAt: "2026-10-09T03:59:00.000Z", sha256: "test-source-hash", url: "https://zvote.zfnd.org", metadataUrl: "https://openzcash.org", warning: null
  }, activityFixture(), revealHistory);
}
function renderDashboard(value = dashboard()) {
  return render(<CoinholderWorkspace {...frame} initialData={value} />);
}
const response = (value: CoinholderDashboard) => ({ ok: true, status: 200, json: async () => value });
const refreshButton = () => screen.getByRole("button", { name: "Refresh Coinholder sources" });
function expectHistoricalCharts() {
  for (const name of ["Cast volume", "Revealed shares", "Shares vs ZEC", "Decision margin", "Reveal heatmap"]) {
    expect(screen.getByRole("region", { name })).toBeInTheDocument();
  }
  const selector = screen.getByRole("combobox", { name: "Activity proposal" });
  expect(within(selector).getAllByRole("option")).toHaveLength(38);
  expect(within(selector).getByRole("option", { name: "All 37 proposals" })).toBeInTheDocument();
}

beforeEach(() => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected test fetch")));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Coinholder source refresh", () => {
  it("keeps the changing source age outside the screen reader live announcement", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    renderDashboard();
    const announcement = within(refreshButton().closest(".coin-source-control") as HTMLElement).getByRole("status");
    expect(announcement).toHaveTextContent(/^Sources matched$/);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByText(/15s ago/)).toBeInTheDocument();
    expect(announcement).toHaveTextContent(/^Sources matched$/);
    expect(announcement).not.toHaveTextContent(/ago/);
  });

  it("retains dated results on a failed refresh and clears the warning after a successful check", async () => {
    const next = dashboard();
    next.source.checkedAt = "2026-10-09T04:01:00.000Z";
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response(next));
    vi.stubGlobal("fetch", fetcher);
    renderDashboard();
    fireEvent.click(refreshButton());
    await screen.findByText(/Couldn’t refresh the sources/);
    expectHistoricalCharts();
    expect(screen.getByText("Saved snapshot")).toBeInTheDocument();
    expect(screen.getByText(/Snapshot: Oct 9, 03:59:00 UTC/)).toBeInTheDocument();
    fireEvent.click(refreshButton());
    await waitFor(() => expect(screen.queryByText(/Couldn’t refresh the sources/)).not.toBeInTheDocument());
    expect(screen.getByText("Sources matched")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Source details"));
    const checkedAtRow = screen.getByText("Last source check").parentElement!;
    expect(checkedAtRow).toHaveTextContent("Oct 9, 04:01:00 UTC");
    expect(fetcher).toHaveBeenCalledWith("/api/communities/community-a/coinholder?history=omit", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  });

  it("preserves immutable history during summary-only refreshes", async () => {
    const next = dashboard();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...next, activity: null, revealHistory: null, activityOmitted: true }) }));
    renderDashboard();
    fireEvent.click(refreshButton());
    await waitFor(() => expect(refreshButton()).not.toBeDisabled());
    expect(screen.getByRole("img", { name: /Casts per day, 12 casts/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Revealed shares" })).toHaveTextContent("145,620");
    fireEvent.change(screen.getByRole("combobox", { name: "Activity proposal" }), { target: { value: "1" } });
    expect(screen.getByRole("img", { name: /Casts per day, 6 casts/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Revealed shares" })).toHaveTextContent("4,029");
  });

  it("keeps reveal history daily while cast intervals change and filters both by proposal", () => {
    renderDashboard();
    const shares = screen.getByRole("region", { name: "Revealed shares" });
    expect(shares).toHaveTextContent("145,620");
    fireEvent.click(within(screen.getByRole("group", { name: "Cast interval" })).getByRole("button", { name: "Hourly" }));
    expect(shares).toHaveTextContent("Daily · UTC");
    expect(shares).toHaveTextContent("145,620");
    fireEvent.change(screen.getByRole("combobox", { name: "Activity proposal" }), { target: { value: "37" } });
    expect(screen.getByRole("region", { name: "Revealed shares" })).toHaveTextContent("4,043");
    expect(screen.getByRole("region", { name: "Shares vs ZEC" })).toHaveTextContent("ZODL");
    expect(screen.getByRole("region", { name: "Decision margin" })).toHaveTextContent("ZODL");
    expect(screen.getByRole("region", { name: "Reveal heatmap" })).toHaveTextContent("ZODL");
    fireEvent.change(screen.getByRole("combobox", { name: "Activity proposal" }), { target: { value: "all" } });
    expect(screen.getByRole("region", { name: "Revealed shares" })).toHaveTextContent("145,620");
  });

  it("shares proposal selections from every new insight and restores all proposals", () => {
    renderDashboard();
    for (const [region, button] of [
      ["Shares vs ZEC", /^#8 /], ["Decision margin", /^Select #8 /], ["Reveal heatmap", /^#8 CyphZec.com$/]
    ] as const) {
      fireEvent.click(within(screen.getByRole("region", { name: region })).getByRole("button", { name: button }));
      expect(screen.getByRole("combobox", { name: "Activity proposal" })).toHaveValue("8");
      expect(screen.getByRole("region", { name: "Revealed shares" })).toHaveTextContent("3,903");
      expect(screen.getByRole("region", { name: "Shares vs ZEC" })).toHaveTextContent("60,769.125 ZEC");
      expect(screen.getByRole("region", { name: "Decision margin" })).toHaveTextContent("2,179,209.875 ZEC");
      expect(within(screen.getByRole("region", { name: "Reveal heatmap" })).getByRole("table").querySelectorAll("tbody tr")).toHaveLength(1);
      fireEvent.click(within(screen.getByRole("region", { name: region })).getByRole("button", { name: "All proposals" }));
      expect(screen.getByRole("combobox", { name: "Activity proposal" })).toHaveValue("all");
    }
  });

  it.each([401, 403, 404])("hides stale community content when access changes (%s)", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
    renderDashboard();
    fireEvent.click(refreshButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Your community session has changed");
    expect(screen.queryByRole("combobox", { name: "Activity proposal" })).not.toBeInTheDocument();
    for (const name of ["Cast volume", "Revealed shares", "Shares vs ZEC", "Decision margin", "Reveal heatmap"]) {
      expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
  });

  it("rejects a mismatched round response without replacing the displayed historical results", async () => {
    const wrong = dashboard();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...wrong, round: { ...wrong.round, id: "another-round" } }) }));
    renderDashboard();
    fireEvent.click(refreshButton());
    await screen.findByText(/Couldn’t refresh the sources/);
    expectHistoricalCharts();
  });

  it("pauses background checks while hidden and refreshes when the page becomes visible", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const fetcher = vi.fn().mockResolvedValue(response(dashboard()));
    vi.stubGlobal("fetch", fetcher);
    renderDashboard();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetcher).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    await act(async () => { fireEvent(document, new Event("visibilitychange")); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("coalesces pending checks and aborts the request and polling on unmount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn().mockImplementation((_url, init) => {
      signal = init.signal;
      return new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    });
    vi.stubGlobal("fetch", fetcher);
    const view = renderDashboard();
    fireEvent.click(refreshButton());
    expect(refreshButton()).toBeDisabled();
    fireEvent.click(refreshButton());
    fireEvent(document, new Event("visibilitychange"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { view.unmount(); });
    expect(signal?.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
