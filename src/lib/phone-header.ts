/**
 * The identity block of the phone top bar: the app's mark beside one or two
 * lines that say where the visitor is. It carries what the breadcrumb says on
 * wide screens (app, page, detail), folded to fit a phone. Pure rules, so the
 * shell only draws.
 */
import type { AppDef, Place } from "./design-routes";

/** The mark's side in CSS pixels. Logos are 128px and up, so it stays sharp at 3x. */
export const PHONE_MARK_SIZE = 26;

export type PhoneHeader = {
  /**
   * How deep the route sits. "app": the mark and the name, no link. "page":
   * the mark and the first line are one link to the app. "detail": the first
   * line leads to the list, so the mark alone leads to the app.
   */
  level: "app" | "page" | "detail";
  /** The app the route belongs to; its mark is drawn beside the names. */
  app: AppDef;
  /** The quiet first line, one step up the trail. None on an app's landing page. */
  over?: { label: string; href: string };
  /** The page the visitor is on. */
  title: string;
};

/**
 * What the phone top bar shows for a place in the navigation model. Undefined
 * for routes the model does not know (About Zarvis, Sign in): there the bar
 * falls back to the page's own document title, with no mark.
 */
export function phoneHeaderOf(
  place: Place | undefined,
): PhoneHeader | undefined {
  if (!place) return undefined;
  const { app, page, detail } = place;
  if (detail) {
    return {
      level: "detail",
      app,
      over: { label: detail.parent.label, href: detail.parent.href },
      title: detail.label,
    };
  }
  if (page) {
    return {
      level: "page",
      app,
      over: { label: app.label, href: app.href },
      title: page.label,
    };
  }
  return { level: "app", app, title: app.label };
}
