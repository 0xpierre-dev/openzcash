import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { zarvisConfig } from "./config";
beforeEach(() => { for (const name of ["ZARVIS_PROVIDER", "ZARVIS_MODEL", "ZARVIS_FALLBACK_PROVIDER", "ZARVIS_FALLBACK_MODEL", "ANTHROPIC_API_KEY", "XAI_API_KEY", "OPENAI_API_KEY"]) vi.stubEnv(name, ""); });
afterEach(() => vi.unstubAllEnvs());
describe("Anthropic provider configuration", () => {
  it("selects Claude with its own key, label and default model, and never reuses another provider's key", () => {
    vi.stubEnv("ZARVIS_PROVIDER", "anthropic"); vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-test"); vi.stubEnv("OPENAI_API_KEY", "openai-test"); vi.stubEnv("XAI_API_KEY", "xai-test");
    vi.stubEnv("ZARVIS_ENABLED", "true"); vi.stubEnv("DATABASE_URL", "test");
    const config = zarvisConfig();
    expect(config).toMatchObject({ provider: "anthropic", apiKey: "anthropic-test", model: "claude-sonnet-5-5", providerLabel: "Anthropic (Claude)", enabled: true, fallback: null });
    vi.stubEnv("ZARVIS_MODEL", "claude-haiku-5-5"); expect(zarvisConfig().model).toBe("claude-haiku-5-5");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(zarvisConfig()).toMatchObject({ apiKey: "", enabled: false });
  });
  it("configures the fallback provider only with a valid name, its own key and a different provider", () => {
    vi.stubEnv("ZARVIS_PROVIDER", "anthropic"); vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-test");
    vi.stubEnv("ZARVIS_FALLBACK_PROVIDER", "xai");
    expect(zarvisConfig().fallback).toBeNull();
    vi.stubEnv("XAI_API_KEY", "xai-test");
    expect(zarvisConfig().fallback).toEqual({ provider: "xai", apiKey: "xai-test", model: "grok-4.7", providerLabel: "xAI (Grok)", webSearch: true });
    vi.stubEnv("ZARVIS_FALLBACK_MODEL", "grok-4.6"); expect(zarvisConfig().fallback?.model).toBe("grok-4.6");
    vi.stubEnv("ZARVIS_WEB_SEARCH", "false"); expect(zarvisConfig().fallback?.webSearch).toBe(false);
    vi.stubEnv("ZARVIS_FALLBACK_PROVIDER", "openai"); vi.stubEnv("OPENAI_API_KEY", "openai-test"); vi.stubEnv("ZARVIS_FALLBACK_MODEL", ""); vi.stubEnv("ZARVIS_WEB_SEARCH", "");
    expect(zarvisConfig().fallback).toMatchObject({ provider: "openai", model: "gpt-5-mini", providerLabel: "OpenAI" });
    vi.stubEnv("ZARVIS_FALLBACK_PROVIDER", "anthropic"); expect(zarvisConfig().fallback).toBeNull();
    vi.stubEnv("ZARVIS_FALLBACK_PROVIDER", "other"); expect(zarvisConfig().fallback).toBeNull();
    vi.stubEnv("ZARVIS_PROVIDER", "xai"); vi.stubEnv("XAI_API_KEY", "xai-test"); vi.stubEnv("ZARVIS_FALLBACK_PROVIDER", "xai");
    expect(zarvisConfig().fallback).toBeNull();
    vi.stubEnv("ZARVIS_FALLBACK_PROVIDER", "openai"); expect(zarvisConfig().fallback?.provider).toBe("openai");
  });
});
