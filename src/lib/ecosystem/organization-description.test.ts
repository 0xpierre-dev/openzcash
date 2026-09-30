import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import registry from "@/data/ecosystem/registry.json";
import { organizationDescription } from "./data";

const line = (id: string) =>
  registry.organizations.find((o) => o.id === id)?.description ?? "";

describe("organizationDescription", () => {
  it("returns the registry line whole when it fits a link preview", () => {
    expect(organizationDescription("zodl")).toBe(line("zodl"));
    expect(organizationDescription("zakura")).toBe(line("zakura"));
  });

  it("keeps only the whole sentences that fit", () => {
    const fitted = organizationDescription("project-tachyon")!;
    expect(line("project-tachyon").length).toBeGreaterThan(200);
    expect(fitted.length).toBeLessThanOrEqual(200);
    expect(line("project-tachyon").startsWith(fitted)).toBe(true);
    expect(fitted.endsWith(".")).toBe(true);
  });

  it("cuts at a word when not even one sentence fits", () => {
    const fitted = organizationDescription("project-tachyon", 40)!;
    expect(fitted.length).toBeLessThanOrEqual(41);
    expect(fitted.endsWith("…")).toBe(true);
  });

  it("is undefined for an unknown organisation", () => {
    expect(organizationDescription("nobody")).toBeUndefined();
  });
});
