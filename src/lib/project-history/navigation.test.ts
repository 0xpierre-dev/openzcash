import { describe, expect, it } from "vitest";
import { backOf, placeOf } from "@/lib/design-routes";

describe("project history navigation", () => {
  it("returns a project to its directory and the directory to Ecosystem", () => {
    expect(placeOf("/ecosystem/history/community-zcash-brazil")).toMatchObject({
      app: { id: "ecosystem" }, detail: { label: "Project history", parent: { href: "/ecosystem/history" } },
    });
    expect(backOf("/ecosystem/history/zaino").href).toBe("/ecosystem/history");
    expect(backOf("/ecosystem/history").href).toBe("/ecosystem");
  });
});
