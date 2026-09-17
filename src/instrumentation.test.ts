import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("server data collection scheduling", () => {
  it("keeps a test snapshot intact across server restarts", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DISABLE_AUTO_REFRESH", "true");
    await register();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains startup and recurring collection when enabled", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DISABLE_AUTO_REFRESH", undefined);
    await register();
    expect(vi.getTimerCount()).toBe(2);
  });
});
