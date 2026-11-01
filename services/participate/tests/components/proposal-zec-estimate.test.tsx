import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZcgProposalExamples } from "@/components/zcg-proposal-examples";
import { ZCG_PROPOSAL_EXAMPLES } from "@/lib/data/zcg-proposal-examples";
import { ZCG_REVIEW_PROPOSALS } from "@/lib/data/zcg-review-proposals";
import { useProposalZecPrice } from "@/components/proposal-zec-estimate";

const now = new Date("2026-10-10T12:00:00Z");
const data = (at = now, rate = "33333000000") => ({ rateUsdPerZecE8: rate, quotedAt: at.toISOString(), retrievedAt: at.toISOString(), expiresAt: new Date(+at + 300_000).toISOString() });
const fetcher = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); fetcher.mockReset();
  fetcher.mockImplementation(async () => ({ ok: true, json: async () => data() }));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
const show = async (proposals = [...ZCG_REVIEW_PROPOSALS, ...ZCG_PROPOSAL_EXAMPLES]) => {
  await act(async () => { render(<ZcgProposalExamples proposals={proposals} />); });
  fireEvent.click(screen.getByRole("button", { name: "Approved" }));
};

describe("approved proposal ZEC estimates", () => {
  it("shares one price request across four approved cards and keeps requests separate", async () => {
    await show();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/participate/zec-price");
    expect(screen.getAllByRole("button", { name: /≈ .* ZEC today/ }).map(button => button.textContent)).toEqual(["≈ 24.00 ZECtoday", "≈ 24.00 ZECtoday", "≈ 60.90 ZECtoday", "≈ 81.00 ZECtoday"]);
    expect(screen.getAllByRole("group", { name: "Approved budget: $8,000.00 USD" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Rejected" }));
    expect(screen.getByRole("group", { name: "Requested budget: $65,000 USD" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Under review" }));
    expect(screen.queryByRole("button", { name: /ZEC today/ })).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("shows the estimate immediately when the server clock is 203 ms ahead", async () => {
    const quote = { ...data(new Date(+now - 17_000)), retrievedAt: new Date(+now + 203).toISOString() };
    fetcher.mockImplementationOnce(async () => ({ ok: true, json: async () => quote }));
    await show([ZCG_PROPOSAL_EXAMPLES[0]]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /≈ 24.00 ZEC today/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: "ZEC estimate unavailable" })).not.toBeInTheDocument();
  });
  it("opens the amount, dated price and sources on click, with keyboard and outside dismissal", async () => {
    await show([ZCG_PROPOSAL_EXAMPLES[0]]);
    const trigger = screen.getByRole("button", { name: /≈ 24.00 ZEC today/ });
    fireEvent.click(trigger);
    const details = within(screen.getByRole("region", { name: "ZEC estimate details" }));
    expect(details.getByText("$8,000.00 USD")).toBeVisible();
    expect(details.getByText("$333.33 USD")).toBeVisible();
    expect(details.getByRole("link", { name: "Approved budget ↗" })).toHaveAttribute("href", ZCG_PROPOSAL_EXAMPLES[0].minutesUrl);
    expect(details.getByRole("link", { name: "CoinGecko ↗" })).toHaveAttribute("href", "https://www.coingecko.com/en/coins/zcash");
    expect(details.getByText(/Oct 10, 2026.*12:00:00 UTC/)).toHaveAttribute("datetime", now.toISOString());
    expect(details.getByText(/Prior payments aren’t deducted/)).toBeVisible();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    fireEvent.click(trigger); fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
  it("refreshes all amounts together after a minute without changing the USD budgets", async () => {
    await show();
    fetcher.mockImplementation(async () => ({ ok: true, json: async () => data(new Date(), "40000000000") }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("button", { name: /≈ 20.00 ZEC today/ })).toHaveLength(2);
    expect(screen.getAllByRole("group", { name: "Approved budget: $8,000.00 USD" })).toHaveLength(2);
  });
  it("removes expired values while a refresh is still pending", async () => {
    fetcher.mockImplementationOnce(async () => ({ ok: true, json: async () => data(new Date(+now - 235_000)) }));
    await show([ZCG_PROPOSAL_EXAMPLES[0]]);
    fetcher.mockImplementation(() => new Promise(() => {}));
    await act(async () => { await vi.advanceTimersByTimeAsync(65_000); });
    expect(screen.queryByRole("button", { name: /≈/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ZEC estimate unavailable" })).toBeVisible();
  });
  it("keeps a valid estimate through a refresh failure and recovers within 15 seconds", async () => {
    await show([ZCG_PROPOSAL_EXAMPLES[0]]);
    fetcher.mockRejectedValueOnce(new Error("Temporary connection failure"));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByRole("button", { name: /≈ 24.00 ZEC today/ })).toBeVisible();
    fetcher.mockImplementation(async () => ({ ok: true, json: async () => data(new Date(), "40000000000") }));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: /≈ 20.00 ZEC today/ })).toBeVisible();
  });
  it("never extends the original expiry during repeated failed refreshes", async () => {
    fetcher.mockImplementationOnce(async () => ({ ok: true, json: async () => data(new Date(+now - 235_000)) }));
    await show([ZCG_PROPOSAL_EXAMPLES[0]]);
    fetcher.mockRejectedValue(new Error("Offline"));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByRole("button", { name: /≈ 24.00 ZEC today/ })).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(screen.getByRole("button", { name: "ZEC estimate unavailable" })).toBeVisible();
  });
  it("backs off repeated failures and cancels retries after leaving the list", async () => {
    fetcher.mockRejectedValue(new Error("Offline"));
    await show([ZCG_PROPOSAL_EXAMPLES[0]]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetcher).toHaveBeenCalledTimes(4);
    cleanup();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("keeps expiry active when price fetching is disabled and re-enabled", async () => {
    fetcher.mockImplementationOnce(async () => ({ ok: true, json: async () => data(new Date(+now - 235_000)) }));
    const hook = renderHook(({ enabled }) => useProposalZecPrice(enabled), { initialProps: { enabled: true } });
    await act(async () => {});
    expect(hook.result.current.status).toBe("ready");
    await act(async () => { await vi.advanceTimersByTimeAsync(55_000); });
    hook.rerender({ enabled: false });
    fetcher.mockRejectedValue(new Error("Offline"));
    await act(async () => { hook.rerender({ enabled: true }); });
    expect(hook.result.current.status).toBe("ready");
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(hook.result.current).toEqual({ status: "unavailable", price: null });
  });
  it.each(["error", "expired", "future"])("shows no numerical estimate on %s, and recovers on the next check", async failure => {
    fetcher.mockImplementationOnce(async () => ({ ok: failure !== "error", json: async () => data(new Date(+now + (failure === "future" ? 2001 : -300_000))) }));
    await show([ZCG_PROPOSAL_EXAMPLES[0]]);
    expect(screen.queryByRole("button", { name: /≈/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ZEC estimate unavailable" }));
    expect(screen.getByText(/A fresh price is unavailable/)).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByRole("button", { name: /≈ 24.00 ZEC today/ })).toBeVisible();
  });
  it("does not fetch for rejected, unreviewed or unverified approved budgets", async () => {
    await show([...ZCG_REVIEW_PROPOSALS, ZCG_PROPOSAL_EXAMPLES[2], { ...ZCG_PROPOSAL_EXAMPLES[0], id: "unverified-approval" }]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /ZEC/ })).not.toBeInTheDocument();
  });
  it("pauses polling in a hidden tab and checks immediately on return", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await show([ZCG_PROPOSAL_EXAMPLES[0]]);
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetcher).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    await act(async () => { fireEvent(document, new Event("visibilitychange")); });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
