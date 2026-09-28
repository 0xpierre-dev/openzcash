import { describe, expect, it } from "vitest";
import { INCIDENTS, LIMITATIONS, PROVIDER_RETENTION, modelLine, quotaLines } from "./about";
const quota = { networkWindowLimit: 60, networkDailyLimit: 600, dailyUsdCap: 100, quotaPause: { active: false, until: null } };
describe("Zarvis about content", () => {
  it("states the per-network limits and the presence of a spending ceiling without its value", () => {
    const lines = quotaLines(quota);
    expect(lines[0]).toContain("60 questions per 10 minutes and 600 per day");
    expect(lines[1]).toContain("daily spending ceiling"); expect(lines.join(" ")).not.toContain("100");
    expect(quotaLines({ ...quota, dailyUsdCap: null })[1]).not.toContain("spending ceiling");
    expect(lines).toHaveLength(2);
  });
  it("mentions an active quota pause with its UTC expiry", () => {
    const lines = quotaLines({ ...quota, quotaPause: { active: true, until: "2026-09-29T03:00:00.000Z" } });
    expect(lines[2]).toBe("Per-visitor and site-wide question caps are paused until 2026-09-29 03:00 UTC; the spending ceiling still applies.");
  });
  it("describes the model or says model answers are off", () => {
    expect(modelLine({ providerLabel: "xAI (Grok)", model: "grok-4.7", webSearch: true, enabled: true })).toMatch(/^grok-4\.7 from xAI \(Grok\), called through its Responses API, with the provider's hosted web search/);
    expect(modelLine({ providerLabel: "xAI (Grok)", model: "grok-4.7", webSearch: false, enabled: true })).toContain("without web search");
    expect(modelLine({ providerLabel: "OpenAI", model: "gpt-5-mini", webSearch: true, enabled: false })).toContain("switched off");
  });
  it("keeps the retention statement and the incident record dated and sourced", () => {
    expect(PROVIDER_RETENTION).toMatchObject({ days: 30, url: "https://docs.x.ai/developers/faq/security" });
    expect(INCIDENTS.length).toBeGreaterThanOrEqual(3);
    for (const incident of INCIDENTS) { expect(incident.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(incident.fix.length).toBeGreaterThan(40); }
    expect(LIMITATIONS.some((l) => /not an official spokesperson/.test(l))).toBe(true);
  });
});
