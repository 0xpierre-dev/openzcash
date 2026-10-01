import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MOBILE_NAV_QUERY,
  MOBILE_TABS,
  SITE_NAME,
  currentTab,
  pageNameOf,
} from "./mobile-tabs";

const publicFile = (src: string) =>
  fileURLToPath(new URL(`../../public${src}`, import.meta.url));

describe("MOBILE_TABS", () => {
  it("lists the five tabs in bar order, Zarvis in the centre", () => {
    expect(MOBILE_TABS.map((t) => t.label)).toEqual([
      "Home",
      "Treasury",
      "Zarvis",
      "Search",
      "Apps",
    ]);
    expect(MOBILE_TABS[2].id).toBe("zarvis");
  });

  it("links Home to the site's home and Zarvis to its page", () => {
    const links = MOBILE_TABS.filter((t) => t.kind === "link");
    expect(links.map((t) => [t.id, t.href])).toEqual([
      ["home", "/zcg"],
      ["zarvis", "/zarvis"],
    ]);
  });

  it("opens Treasury, Search and Apps as sheets, with no route of their own", () => {
    const sheets = MOBILE_TABS.filter((t) => t.kind === "sheet");
    expect(sheets.map((t) => t.id)).toEqual(["treasury", "search", "apps"]);
    for (const tab of sheets) expect(tab).not.toHaveProperty("href");
  });

  it("gives every tab but Zarvis a PNG glyph that exists under /public", () => {
    for (const tab of MOBILE_TABS) {
      if (tab.id === "zarvis") {
        // The centre tab draws the Zarvis mark itself.
        expect(tab.icon).toBeUndefined();
        continue;
      }
      expect(tab.icon).toMatch(/^\/logos\/tabs\/[a-z-]+\.png$/);
      expect(existsSync(publicFile(tab.icon as string))).toBe(true);
    }
  });

  it("keeps ids unique and labels short enough for a fifth of a phone", () => {
    expect(new Set(MOBILE_TABS.map((t) => t.id)).size).toBe(MOBILE_TABS.length);
    for (const tab of MOBILE_TABS)
      expect(tab.label.length).toBeLessThanOrEqual(8);
  });
});

describe("currentTab", () => {
  it("marks Home on the site's home only", () => {
    expect(currentTab("/zcg")).toBe("home");
    expect(currentTab("/")).toBe("home");
    expect(currentTab("/zcg/")).toBe("home");
  });

  it("does not mark Home on the pages beneath it", () => {
    expect(currentTab("/zcg/grants")).toBeNull();
    expect(currentTab("/zcg/office")).toBeNull();
  });

  it("marks Zarvis on its page and everything below it", () => {
    expect(currentTab("/zarvis")).toBe("zarvis");
    expect(currentTab("/zarvis/about")).toBe("zarvis");
    expect(currentTab("/zarvis/about/")).toBe("zarvis");
  });

  it("does not confuse a route that merely starts with the same letters", () => {
    expect(currentTab("/zarvis-notes")).toBeNull();
    expect(currentTab("/zcgx")).toBeNull();
  });

  it("marks no tab anywhere else", () => {
    for (const path of [
      "/news",
      "/coinholders",
      "/coinholders/results",
      "/login",
      "",
    ]) {
      expect(currentTab(path)).toBeNull();
    }
  });
});

describe("pageNameOf", () => {
  it("takes the page's own name from a document title", () => {
    expect(pageNameOf("About Zarvis · OpenZcash")).toBe("About Zarvis");
    expect(pageNameOf("Sign in · OpenZcash")).toBe("Sign in");
    expect(pageNameOf("Register treasury · OpenZcash")).toBe(
      "Register treasury",
    );
  });

  it("keeps a title that has no site suffix", () => {
    expect(pageNameOf("Q2 2026 Report")).toBe("Q2 2026 Report");
  });

  it("reads the site's default title as the site name", () => {
    expect(
      pageNameOf("OpenZcash · Dev Fund treasury and public transparency"),
    ).toBe("OpenZcash");
  });

  it("falls back to the site name when the title is missing", () => {
    expect(pageNameOf("")).toBe(SITE_NAME);
    expect(pageNameOf("   ")).toBe(SITE_NAME);
    expect(pageNameOf(" · OpenZcash")).toBe(SITE_NAME);
    expect(SITE_NAME).toBe("OpenZcash");
  });
});

describe("MOBILE_NAV_QUERY", () => {
  it("is the width where the sidebar is already a drawer", () => {
    expect(MOBILE_NAV_QUERY).toBe("(max-width: 960px)");
  });
});
