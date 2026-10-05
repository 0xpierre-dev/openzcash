import { legalSourceUrl, mergeLegalItems, validLegalDate } from "./pgp-parser";
import type { LegalItem } from "./types";

export const BCB_NOTES_URL = "https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/notasImprensa";
const ATOM = "http://www.w3.org/2005/Atom";
type XmlNode = { name: string; namespace: string; attributes: Record<string, string>; text: string; children: XmlNode[] };

function entities(text: string): string {
  return text.replace(/&(?:([^;\s<&]{1,40});)?/g, (_, entity: string | undefined) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (entity && Object.hasOwn(named, entity)) return named[entity];
    const numeric = entity?.match(/^#(x[\da-f]+|\d+)$/i);
    if (numeric) {
      const value = numeric[1][0].toLowerCase() === "x" ? parseInt(numeric[1].slice(1), 16) : Number(numeric[1]);
      if (value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)) return String.fromCodePoint(value);
    }
    throw new Error("BCB_INVALID_XML_ENTITY");
  });
}

/** Bounded inert XML reader: no DTD, external entities, network or execution. */
function xmlDocument(xml: string): XmlNode {
  const stack: Array<{ node: XmlNode; qualified: string; namespaces: Record<string, string> }> = [];
  let root: XmlNode | null = null, cursor = 0, nodes = 0;
  const append = (text: string) => {
    if (stack.length) stack[stack.length - 1].node.text += text;
    else if (text.trim()) throw new Error("BCB_INVALID_XML_ROOT");
  };
  while (cursor < xml.length) {
    if (xml.startsWith("<!--", cursor)) {
      const end = xml.indexOf("-->", cursor + 4);
      if (end < 0) throw new Error("BCB_INVALID_XML_COMMENT");
      cursor = end + 3; continue;
    }
    if (xml.startsWith("<?", cursor)) {
      const end = xml.indexOf("?>", cursor + 2);
      if (end < 0) throw new Error("BCB_INVALID_XML_DECLARATION");
      cursor = end + 2; continue;
    }
    if (xml.startsWith("<![CDATA[", cursor)) {
      const end = xml.indexOf("]]>", cursor + 9);
      if (end < 0 || !stack.length) throw new Error("BCB_INVALID_XML_CDATA");
      append(xml.slice(cursor + 9, end)); cursor = end + 3; continue;
    }
    if (xml[cursor] !== "<") {
      const next = xml.indexOf("<", cursor);
      const end = next < 0 ? xml.length : next;
      append(entities(xml.slice(cursor, end))); cursor = end; continue;
    }
    const tag = xml.slice(cursor).match(/^<((?:[^<>"']|"[^"]*"|'[^']*')*)>/);
    if (!tag) throw new Error("BCB_INVALID_XML_TAG");
    cursor += tag[0].length;
    const value = tag[1].trim();
    if (value.startsWith("!")) throw new Error("BCB_XML_DECLARATIONS_NOT_ALLOWED");
    if (value.startsWith("/")) {
      const closed = stack.pop();
      if (!closed || closed.qualified !== value.slice(1).trim()) throw new Error("BCB_INVALID_XML_NESTING");
      if (stack.length) stack[stack.length - 1].node.text += closed.node.text;
      continue;
    }
    const opening = value.match(/^([A-Za-z_][\w.:-]*)([\s\S]*?)(\/?)$/);
    if (!opening || ++nodes > 5_000 || stack.length > 24) throw new Error("BCB_INVALID_XML_ELEMENT");
    const attributes: Record<string, string> = {};
    let rest = opening[2];
    while (rest.trim()) {
      const attribute = rest.match(/^\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
      if (!attribute || Object.hasOwn(attributes, attribute[1])) throw new Error("BCB_INVALID_XML_ATTRIBUTE");
      attributes[attribute[1]] = entities(attribute[2] ?? attribute[3]);
      rest = rest.slice(attribute[0].length);
    }
    const namespaces = { ...(stack.at(-1)?.namespaces ?? {}) };
    for (const [key, namespace] of Object.entries(attributes)) {
      if (key === "xmlns") namespaces[""] = namespace;
      else if (key.startsWith("xmlns:")) namespaces[key.slice(6)] = namespace;
    }
    const parts = opening[1].split(":");
    if (parts.length > 2 || (parts.length === 2 && !namespaces[parts[0]])) throw new Error("BCB_INVALID_XML_NAMESPACE");
    const node: XmlNode = { name: parts.at(-1)!, namespace: namespaces[parts.length === 2 ? parts[0] : ""] ?? "", attributes, text: "", children: [] };
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else if (root) throw new Error("BCB_INVALID_XML_ROOT");
    else root = node;
    if (!opening[3]) stack.push({ node, qualified: opening[1], namespaces });
  }
  if (!root || stack.length || root.name !== "feed" || root.namespace !== ATOM) throw new Error("BCB_ATOM_FEED_UNAVAILABLE");
  return root;
}

const children = (node: XmlNode, name: string) => node.children.filter(child => child.namespace === ATOM && child.name === name);
const field = (node: XmlNode, name: string) => children(node, name)[0]?.text.trim();
function textContent(value: string) {
  const plain = value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  // Atom HTML content has one additional HTML-entity layer. Unknown named
  // entities are kept as text; none can introduce markup or requests.
  return plain.replace(/&(?:#(?:x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, value => value === "&nbsp;" ? " " : entities(value))
    .replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim();
}

function dateFromAtom(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  return validLegalDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value)) ? value.slice(0, 10) : null;
}

export function parseBcbNotes(xml: string, asOf: string): LegalItem[] {
  if (!validLegalDate(asOf)) throw new Error("INVALID_AS_OF_DATE");
  const root = xmlDocument(xml.replace(/^\ufeff/, ""));
  const entries = children(root, "entry");
  if (entries.length > 100) throw new Error("BCB_ATOM_FEED_TOO_LARGE");
  const items: LegalItem[] = [];
  for (const entry of entries) {
    const title = textContent(field(entry, "title") ?? "");
    const content = textContent(field(entry, "summary") ?? field(entry, "content") ?? "");
    const relevance = `${title} ${content}`.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (!/\b(?:criptoativos?|criptomoedas?|ativos? virtua(?:l|is)|virtual assets?|stablecoins?|autocustodi\w*|self.custody)\b/.test(relevance)) continue;
    const rawUrl = children(entry, "link").find(link => !link.attributes.rel || link.attributes.rel === "alternate")?.attributes.href ?? "";
    const url = legalSourceUrl(rawUrl);
    const parsed = url ? new URL(url) : null;
    const published = field(entry, "published"), updated = field(entry, "updated");
    const publishedAt = dateFromAtom(published ?? updated);
    // A relevant entry with incomplete provenance marks the source unhealthy;
    // silently turning it into an empty current feed would hide a schema change.
    if (!url || !parsed || parsed.hostname !== "www.bcb.gov.br" || parsed.port ||
        !/^\/detalhenoticia\/\d+\/nota\/?$/.test(parsed.pathname) ||
        !title || title.length > 600 || !content || !publishedAt || publishedAt > asOf) throw new Error("BCB_ATOM_RECORD_UNAVAILABLE");
    const summary = content.length > 480 ? `${content.slice(0, 477).replace(/\s+\S*$/, "")}…` : content;
    items.push({
      id: `bcb:${parsed.pathname.split("/")[2]}`, title, summary, url, sourceId: "bcb", publishedAt,
      dateBasis: published ? "published" : "updated",
      regions: ["latam"], jurisdictions: ["Brazil"], topics: ["Regulation"],
      kind: "Official update", status: "Official update",
      statusDetail: "Excerpt from Banco Central do Brasil's recent press-note feed. The source date is labeled as published or updated; this feed entry alone does not establish the current legal effect of a rule.",
    });
  }
  return mergeLegalItems([], items, asOf);
}
