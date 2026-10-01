/**
 * The bottom tab bar of the phone shell: five tabs, in bar order. Two are
 * places (Home, Zarvis) and three open something over the page (the treasury
 * sheet, the search palette, the apps drawer). Pure data and rules, so the
 * component only draws.
 */

/** Where the sidebar is already a drawer; the tab bar exists only here. Mirrors mobile-shell.css. */
export const MOBILE_NAV_QUERY = "(max-width: 960px)";

/** Tabs that are places. */
export type MobilePlaceId = "home" | "zarvis";
/** Tabs that open a dialog over the page. */
export type MobileSheetId = "treasury" | "search" | "apps";
export type MobileTabId = MobilePlaceId | MobileSheetId;

type TabBase = {
  label: string;
  /** PNG glyph under /public (ink, inverted in dark). The Zarvis tab draws its own mark. */
  icon?: string;
};

export type MobileLinkTab = TabBase & {
  id: MobilePlaceId;
  kind: "link";
  href: string;
};
export type MobileSheetTab = TabBase & { id: MobileSheetId; kind: "sheet" };
export type MobileTab = MobileLinkTab | MobileSheetTab;

export const MOBILE_TABS: readonly MobileTab[] = [
  {
    id: "home",
    label: "Home",
    kind: "link",
    href: "/zcg",
    icon: "/logos/tabs/home.png",
  },
  {
    id: "treasury",
    label: "Treasury",
    kind: "sheet",
    icon: "/logos/tabs/treasury.png",
  },
  { id: "zarvis", label: "Zarvis", kind: "link", href: "/zarvis" },
  {
    id: "search",
    label: "Search",
    kind: "sheet",
    icon: "/logos/tabs/search.png",
  },
  { id: "apps", label: "Apps", kind: "sheet", icon: "/logos/tabs/apps.png" },
];

export const SITE_NAME = "OpenZcash";
/** Page titles read "Page name · OpenZcash". */
const TITLE_SEPARATOR = " · ";

/**
 * The page's own name, taken from its document title. The phone top bar shows
 * it on routes the navigation model has no entry for (About Zarvis, Sign in),
 * where the breadcrumb is empty. A missing title reads as the site name.
 */
export function pageNameOf(documentTitle: string): string {
  const [name = ""] = documentTitle.split(TITLE_SEPARATOR);
  return name.trim() || SITE_NAME;
}

/** "/zcg/" and "/zcg" are the same place; the root stays "/". */
function trimmed(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/**
 * The tab a route belongs to: Home on the site's home only (the root
 * redirects there), Zarvis on its page and everything below it. Sheets never
 * own a route, so every other page marks no tab.
 */
export function currentTab(pathname: string): MobilePlaceId | null {
  const path = trimmed(pathname);
  if (path === "/" || path === "/zcg") return "home";
  if (path === "/zarvis" || path.startsWith("/zarvis/")) return "zarvis";
  return null;
}
