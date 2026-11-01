import { participateParentOrigin, participationThemeMessage } from "@/lib/domain/participate-embed";

describe("Participate trusted parent", () => {
  it("allows an explicit HTTPS origin and loopback in development only", () => {
    expect(participateParentOrigin("https://openzcash.org", "production")).toBe("https://openzcash.org");
    expect(participateParentOrigin("http://localhost:4421", "development")).toBe("http://localhost:4421");
    expect(participateParentOrigin("http://localhost:4421", "production")).toBeNull();
  });
  it.each([undefined, "https://*.openzcash.org", "http://openzcash.org", "https://openzcash.org/zcg", "https://openzcash.org?token=a", "https://user:secret@openzcash.org", "javascript:alert(1)"])("rejects an ambiguous or unsafe parent: %s", value => {
    expect(participateParentOrigin(value, "production")).toBeNull();
  });
  it("accepts appearance only, not actions or private state", () => {
    expect(participationThemeMessage({ type: "participate:theme", version: 1, theme: "dark" })).toBe("dark");
    for (const message of [null, { type: "participate:theme", version: 2, theme: "dark" }, { type: "participate:balance", version: 1 }, { type: "participate:theme", version: 1, theme: "system" }]) expect(participationThemeMessage(message)).toBeNull();
  });
});
