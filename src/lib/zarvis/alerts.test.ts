import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ALERT_INTERVAL_MS, alertState, noteOutcome, noteRejection, noteUnpriced, providerDegraded, resetAlertsForTests, sendAlert } from "./alerts";
const fetchMock = vi.fn();
beforeEach(() => { resetAlertsForTests(); fetchMock.mockReset().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetchMock); vi.stubEnv("ZARVIS_ALERT_WEBHOOK_URL", "https://hooks.example/abc"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Operator alerts", () => {
  it("posts a Discord/Slack compatible payload and rate limits each type to one per ten minutes", () => {
    expect(sendAlert("canary", "Zarvis canary failed: 1 of 4 checks (price).", 1000)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.example/abc"); expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ content: "Zarvis canary failed: 1 of 4 checks (price).", text: "Zarvis canary failed: 1 of 4 checks (price)." });
    expect(sendAlert("canary", "again", 1000 + ALERT_INTERVAL_MS - 1)).toBe(false);
    expect(sendAlert("spend_cap", "other type", 1000 + 1)).toBe(true);
    expect(sendAlert("canary", "later", 1000 + ALERT_INTERVAL_MS)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3); expect(alertState().sent).toBe(3);
  });
  it("stays silent without a webhook or with a non-https one", () => {
    vi.stubEnv("ZARVIS_ALERT_WEBHOOK_URL", ""); expect(sendAlert("canary", "x")).toBe(false);
    vi.stubEnv("ZARVIS_ALERT_WEBHOOK_URL", "http://hooks.example/abc"); expect(sendAlert("canary", "x")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled(); expect(alertState().configured).toBe(false);
  });
  it("flags a provider failure streak of three and a quarter of the last twenty", () => {
    noteOutcome("completed"); noteOutcome("failed", "provider_http_5xx"); noteOutcome("aborted"); noteOutcome("failed", "provider_timeout");
    expect(providerDegraded()).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
    noteOutcome("failed", "provider_timeout");
    expect(providerDegraded()).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(1);
    const message = JSON.parse(fetchMock.mock.calls[0][1].body).content;
    expect(message).toMatch(/3 of the last 4 answers failed \(3 in a row; latest class provider_timeout\)/);
    resetAlertsForTests();
    for (let i = 0; i < 20; i++) noteOutcome(i % 4 === 0 ? "failed" : "completed", "incomplete_response");
    expect(alertState()).toMatchObject({ providerDegraded: true, recentFailures: 5, recentSample: 20, failureStreak: 0 });
    for (let i = 0; i < 20; i++) noteOutcome("completed");
    expect(providerDegraded()).toBe(false);
  });
  it("flags twenty quota, busy or spend-cap rejections within ten minutes and the spend cap itself", () => {
    for (let i = 0; i < 19; i++) noteRejection(i % 2 ? "quota" : "busy", 10_000 + i * 1000);
    expect(fetchMock).not.toHaveBeenCalled(); expect(alertState(28_000).rejectionsLast10Min).toBe(19);
    noteRejection("quota", 10_000 + 19_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).content).toContain("20 requests declined");
    noteRejection("quota", 10_000 + ALERT_INTERVAL_MS + 30_000);
    expect(alertState(10_000 + ALERT_INTERVAL_MS + 30_000).rejectionsLast10Min).toBe(1);
    noteRejection("spend_cap", 10_000 + ALERT_INTERVAL_MS + 31_000);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).content).toMatch(/spend cap.*direct answers continue/);
  });
  it("keeps a bounded rejection window: twenty spread over more than ten minutes never alert, and a flood costs constant work", () => {
    for (let i = 0; i < 200; i++) noteRejection("busy", i * 60_000);
    expect(fetchMock).not.toHaveBeenCalled(); expect(alertState(199 * 60_000).rejectionsLast10Min).toBe(10);
    for (let i = 0; i < 100_000; i++) noteRejection("busy", 200 * 60_000 + i);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(alertState(200 * 60_000 + 100_000).rejectionsLast10Min).toBe(20);
  });
  it("alerts once per ten minutes when a capped deployment cannot price a model answer", () => {
    noteUnpriced("Custom-Model ", 1000); noteUnpriced("Custom-Model ", 2000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).content).toMatch(/could not be priced \(model custom-model\)/);
  });
  it("counts a failed delivery without throwing", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(sendAlert("canary", "x")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(alertState().failed).toBe(1);
  });
});
