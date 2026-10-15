import { attr, elements, excerpt, first, hasClass, htmlText, publicHtml } from "./public-html";
import { legalSourceUrl, mergeLegalItems, validLegalDate } from "./pgp-parser";
import type { LegalItem, LegalSource, LegalTopic } from "./types";

export const AAIP_NEWS_URL = "https://www.argentina.gob.ar/aaip/noticias";
export const URCDP_NEWS_URL = "https://www.gub.uy/unidad-reguladora-control-datos-personales/comunicacion/noticias";
export const LATAM_SOURCES: LegalSource[] = [
  { id: "aaip", name: "Argentina · AAIP", url: AAIP_NEWS_URL, role: "Primary authority", mode: "live" },
  { id: "urcdp", name: "Uruguay · URCDP", url: URCDP_NEWS_URL, role: "Primary authority", mode: "live" },
];

function officialLink(href: string, base: string, path: RegExp): string {
  let url: URL;
  try { url = new URL(href, base); } catch { throw new Error("LEGAL_PUBLIC_LINK_UNAVAILABLE"); }
  const canonical = legalSourceUrl(url.href);
  if (!canonical || url.origin !== new URL(base).origin || !path.test(url.pathname)) throw new Error("LEGAL_PUBLIC_LINK_UNAVAILABLE");
  return canonical;
}
function officialItem(sourceId: string, url: string, title: string, summary: string, publishedAt: string, country: string, asOf: string): LegalItem {
  if (!validLegalDate(asOf) || !validLegalDate(publishedAt) || publishedAt > asOf || !title || title.length > 600 || !summary) throw new Error("LEGAL_PUBLIC_RECORD_UNAVAILABLE");
  const context = `${title} ${summary}`.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const topics: LegalTopic[] = ["Policy"];
  if (sourceId === "urcdp" || /\b(?:datos personales|proteccion de datos|privacidad|privacidade)\b/.test(context)) topics.push("Privacy");
  if (/\b(?:ley|leyes|normativa|resolucion|reglamento|regulatorios?|legislacion)\b/.test(context)) topics.push("Regulation");
  return { id: `${sourceId}:${new URL(url).pathname.split("/").filter(Boolean).at(-1)}`, sourceId, url, title, summary: excerpt(summary), publishedAt,
    regions: ["latam"], jurisdictions: [country], topics, kind: "Official update", status: "Official update",
    statusDetail: "Public authority update. Consult the original document for scope, legal status and effective dates.",
  };
}

/** The AAIP's official news list supplies dated public cards; no article/login crawl. */
export function parseAaipNews(html: string, asOf: string): LegalItem[] {
  const root = publicHtml(html);
  const cards = elements(root, node => node.tagName === "a" && hasClass(node, "panel") && !!first(node, "h3"));
  if (!cards.length || cards.length > 100) throw new Error("AAIP_PUBLIC_SCHEMA_UNAVAILABLE");
  return mergeLegalItems([], cards.map(card => {
    const time = first(card, "time");
    const date = time ? attr(time, "datetime") : "";
    if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?$/.test(date)) throw new Error("AAIP_PUBLIC_DATE_UNAVAILABLE");
    return officialItem("aaip", officialLink(attr(card, "href"), AAIP_NEWS_URL, /^\/noticias\/[a-z0-9-]+\/?$/),
      htmlText(first(card, "h3")), htmlText(first(card, "div", "panel-body")).replace(htmlText(first(card, "time")), "").replace(htmlText(first(card, "h3")), "").trim(),
      date.slice(0, 10), "Argentina", asOf);
  }), asOf);
}

/** Uruguay's public Drupal listing identifies each article and its source date. */
export function parseUrcdpNews(html: string, asOf: string): LegalItem[] {
  const root = publicHtml(html);
  const articles = elements(root, node => node.tagName === "article" && attr(node, "about").startsWith("/unidad-reguladora-control-datos-personales/comunicacion/noticias/"));
  if (!articles.length || articles.length > 100) throw new Error("URCDP_PUBLIC_SCHEMA_UNAVAILABLE");
  return mergeLegalItems([], articles.map(article => {
    const date = htmlText(first(article, "span", "Box-info")).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!date) throw new Error("URCDP_PUBLIC_DATE_UNAVAILABLE");
    const heading = first(article, "h3", "Media-title"), link = heading && first(heading, "a");
    const body = first(article, "div", "Media-body");
    return officialItem("urcdp", officialLink(link ? attr(link, "href") : "", URCDP_NEWS_URL, /^\/unidad-reguladora-control-datos-personales\/comunicacion\/noticias\/[a-z0-9-]+\/?$/),
      htmlText(heading), htmlText(body && first(body, "p")), `${date[3]}-${date[2]}-${date[1]}`, "Uruguay", asOf);
  }), asOf);
}
