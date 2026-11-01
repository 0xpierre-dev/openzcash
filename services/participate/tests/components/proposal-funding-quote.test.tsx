import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalFundingQuote } from "@/components/proposal-funding-quote";
import type { FundingQuoteHistory, FundingQuoteView } from "@/lib/domain/funding-quote";

const hash = "a".repeat(64);
const now = new Date("2026-10-09T12:00:00Z");
const quote: FundingQuoteView = {
  id: "quote-a", kind: "ESTIMATE", proposalHash: hash, usdCents: "180000", rateUsdPerZecE8: "10000000000", amountZat: "1800000000",
  source: "COINGECKO", quotedAt: now.toISOString(), retrievedAt: now.toISOString(), createdAt: now.toISOString(),
  expiresAt: "2026-10-09T12:05:00Z", rounding: "CEILING_ZAT", fees: "EXCLUDED"
};
const history: FundingQuoteHistory = { proposalHash: hash, usdCents: "180000", canEstimate: true, quotes: [] };
const fetcher = vi.fn();
const mount = () => render(<ProposalFundingQuote communityId="dao-a" pollId="poll-a" usdCents="180000" />);
beforeEach(() => {
  fetcher.mockReset(); vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => history });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("proposal payment estimate", () => {
  it("requests a server estimate without submitting a client price or replacing the USD budget", async () => {
    fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ quote }) });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Estimate in ZEC" }));
    expect(await screen.findByText("1 ZEC = $100.00 USD")).toBeInTheDocument();
    expect(screen.getByText(/Indicative only/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CoinGecko ↗" })).toHaveAttribute("href", "https://www.coingecko.com/en/coins/zcash");
    const sent = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(sent).toEqual({ requestKey: expect.any(String), proposalHash: hash });
    expect(screen.queryByRole("button", { name: /Pay|Send/ })).not.toBeInTheDocument();
  });
  it("keeps the same request key after an uncertain network outcome", async () => {
    fetcher.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({ ok: true, json: async () => ({ quote, replayed: true }) });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Estimate in ZEC" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
    fireEvent.click(screen.getByRole("button", { name: "Estimate in ZEC" }));
    await screen.findByRole("button", { name: "Refresh estimate" });
    expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);
  });
  it("marks an open estimate expired at its deadline without a page refresh", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    fetcher.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ...history, quotes: [quote] }) });
    await act(async () => { mount(); });
    expect(screen.getByText("Current")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(300_000));
    expect(screen.getByText("Expired", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh estimate" })).toBeEnabled();
  });
  it("keeps previous revisions in history but does not present them as the current estimate", async () => {
    fetcher.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ...history, quotes: [{ ...quote, proposalHash: "b".repeat(64) }] }) });
    mount(); await screen.findByRole("button", { name: "Estimate in ZEC" });
    expect(screen.getByText("Previous proposal version · CoinGecko")).toBeInTheDocument();
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
  });
  it("blocks estimation if the displayed budget changed and lets users reload", async () => {
    fetcher.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ...history, usdCents: "180001" }) });
    mount(); expect(await screen.findByRole("alert")).toHaveTextContent("The proposal changed");
    expect(screen.getByRole("button", { name: "Reload proposal" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Estimate in ZEC" })).not.toBeInTheDocument();
  });
  it("shows provider failures without a fabricated price", async () => {
    fetcher.mockResolvedValueOnce({ ok: false, json: async () => ({ message: "A current ZEC price is unavailable." }) });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Estimate in ZEC" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("unavailable"));
    expect(screen.queryByText(/1 ZEC =/)).not.toBeInTheDocument();
  });
});
