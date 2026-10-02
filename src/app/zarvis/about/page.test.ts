import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/zarvis/config", () => ({ zarvisConfig: () => ({
  apiKey: "xai-secret-sentinel-value", provider: "xai", providerLabel: "xAI (Grok)", enabled: true, model: "grok-4.7", webSearch: true,
  networkWindowLimit: 60, networkDailyLimit: 600, dailyUsdCap: 100, quotaPause: { active: false, until: null },
  dailyLimit: 1000, hourlyLimit: 100, canaryModel: false, unlimitedLocalTesting: false,
}) }));
import Page from "./page";
describe("About Zarvis page", () => {
  it("explains both routes, the visitor limits, retention and the incidents without leaking configuration", () => {
    const html = renderToStaticMarkup(Page());
    expect(html).toContain("No official token");
    expect(html).toContain("not created, endorsed or issued by OpenZcash");
    expect(html).toContain("Direct from OpenZcash data · no AI");
    expect(html).toContain("3 sources · check them");
    expect(html).toContain("grok-4.7 from xAI (Grok)");
    expect(html).toContain("60 questions per 10 minutes and 600 per day");
    expect(html).toContain("30 days");
    expect(html).toContain("https://docs.x.ai/developers/faq/security");
    expect(html).toContain("Launch-day quota exhaustion");
    expect(html).toContain("You are Zarvis Ironwood");
    expect(html).toContain("/api/zarvis/health");
    expect(html).toContain("forum.zcashcommunity.com/t/openzcash-org-public-transparency/56404");
    expect(html).toContain("every 6 hours");
    expect(html).not.toContain("xai-secret-sentinel-value");
    expect(html).not.toMatch(/\b1000\b|\b1,000\b|\$100\b/);
  });
});
