import { parse, type DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
export type Element = DefaultTreeAdapterMap["element"];
export const attr = (node: Element, name: string) => node.attrs.find(value => value.name === name)?.value ?? "";
export const hasClass = (node: Element, name: string) => attr(node, "class").split(/\s+/).includes(name);
const children = (node: Node): Node[] => "childNodes" in node ? node.childNodes : [];

/** Inert HTML only: scripts, event handlers and linked resources never execute. */
export function publicHtml(html: string) {
  if (Buffer.byteLength(html, "utf8") > 512 * 1024) throw new Error("LEGAL_PUBLIC_RESPONSE_TOO_LARGE");
  return parse(html);
}
export function elements(root: Node, match: (node: Element) => boolean): Element[] {
  const result: Element[] = [], stack = [root];
  let count = 0;
  while (stack.length) {
    if (++count > 30_000) throw new Error("LEGAL_PUBLIC_HTML_TOO_COMPLEX");
    const node = stack.pop()!;
    if ("tagName" in node) {
      if (["script", "style", "template", "noscript"].includes(node.tagName)) continue;
      if (match(node)) result.push(node);
    }
    stack.push(...children(node).toReversed());
  }
  return result;
}
export function first(root: Node, tag: string, className?: string) {
  return elements(root, node => node.tagName === tag && (!className || hasClass(node, className)))[0];
}
export function htmlText(root: Node | undefined): string {
  if (!root) return "";
  const parts: string[] = [], stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if ("tagName" in node && ["script", "style", "template", "noscript"].includes(node.tagName)) continue;
    if (node.nodeName === "#text") parts.push((node as DefaultTreeAdapterMap["textNode"]).value);
    stack.push(...children(node).toReversed());
  }
  return parts.join(" ").replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim();
}
export function excerpt(text: string): string {
  return text.length > 480 ? `${text.slice(0, 477).replace(/\s+\S*$/, "")}…` : text;
}
