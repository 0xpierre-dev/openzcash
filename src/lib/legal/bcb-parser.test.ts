import { describe, expect, it } from "vitest";
import { parseBcbNotes } from "./bcb-parser";

const wrap = (entries: string, prefix = "") => `<${prefix}feed xmlns${prefix ? ":a" : ""}="http://www.w3.org/2005/Atom">${entries}</${prefix}feed>`;
const entry = ({ title = "BC aprimora regras relativas à prestação de serviços de ativos virtuais", date = "<updated>2026-09-23T18:30:57-03:00</updated>", url = "https://www.bcb.gov.br/detalhenoticia/21267/nota", content = "&lt;p&gt;Atualização sobre ativos virtuais &amp;amp; carteiras autocustodiadas.&lt;/p&gt;" } = {}) => `<entry><id>sitefeeds_21267</id><title type="text">${title}</title>${date}<link rel="alternate" href="${url}"/><content type="html">${content}</content></entry>`;
const day = "2026-10-05";

describe("Banco Central do Brasil official Atom notes", () => {
  it("parses the confirmed namespace/attribute link/date shape without treating updated as published", () => {
    const [item] = parseBcbNotes(`\ufeff<?xml version="1.0" encoding="utf-8"?>${wrap(entry())}`, day);
    expect(item).toMatchObject({ id: "bcb:21267", sourceId: "bcb", publishedAt: "2026-09-23", dateBasis: "updated", regions: ["latam"], jurisdictions: ["Brazil"], status: "Official update", kind: "Official update" });
    expect(item.summary).toBe("Atualização sobre ativos virtuais & carteiras autocustodiadas.");
    expect(item).not.toHaveProperty("effectiveAt");
    expect(item).not.toHaveProperty("reviewedAt");
  });
  it("accepts prefixed Atom elements and CDATA without interpreting markup", () => {
    const prefixed = entry({ content: "<![CDATA[<p>Criptoativos: &#160;custódia e privacidade.</p>]]>" }).replace(/<(\/)?(entry|id|title|updated|link|content)\b/g, "<$1a:$2");
    expect(parseBcbNotes(wrap(prefixed, "a:"), day)[0].summary).toBe("Criptoativos: custódia e privacidade.");
  });
  it("uses explicit publication timestamps when supplied, separately from feed freshness", () => {
    const [item] = parseBcbNotes(wrap(entry({ date: "<published>2026-09-22T10:00:00Z</published><updated>2026-09-23T18:30:57-03:00</updated>" })), day);
    expect(item).toMatchObject({ publishedAt: "2026-09-22", dateBasis: "published", sourceUpdatedAt: "2026-09-23T18:30:57-03:00" });
  });
  it("ignores monetary/macroeconomic updates without a specific crypto relevance term", () => {
    expect(parseBcbNotes(wrap(entry({ title: "Estatísticas Monetárias e de Crédito", content: "Política monetária, câmbio e proteção de dados." })), day)).toEqual([]);
    expect(parseBcbNotes(wrap(""), day)).toEqual([]);
  });
  it("deduplicates canonical news URLs and bounds the plain-text excerpt", () => {
    const result = parseBcbNotes(wrap(entry({ content: `Criptoativos. ${"Uma informação pública. ".repeat(100)}` }) + entry()), day);
    expect(result).toHaveLength(1);
    expect(result[0].summary.length).toBeLessThanOrEqual(480);
    expect(result[0].summary.endsWith("…")).toBe(true);
  });
  it.each([
    "https://evil.example/detalhenoticia/21267/nota",
    "https://www.bcb.gov.br.evil.example/detalhenoticia/21267/nota",
    "https://name:secret@www.bcb.gov.br/detalhenoticia/21267/nota",
    "http://www.bcb.gov.br/detalhenoticia/21267/nota",
    "https://www.bcb.gov.br:8443/detalhenoticia/21267/nota",
    "https://www.bcb.gov.br/other/21267", "javascript:alert(1)",
  ])("rejects a relevant record with an unsafe or unexpected source URL: %s", url => {
    expect(() => parseBcbNotes(wrap(entry({ url })), day)).toThrow("BCB_ATOM_RECORD_UNAVAILABLE");
  });
  it.each(["", "<updated>2026-02-30T12:00:00Z</updated>", "<updated>2026-09-23</updated>", "<updated>2027-01-01T12:00:00Z</updated>", "<updated>2026-09-23T28:00:00Z</updated>"])("does not invent a date for missing or invalid provenance: %s", date => {
    expect(() => parseBcbNotes(wrap(entry({ date })), day)).toThrow("BCB_ATOM_RECORD_UNAVAILABLE");
  });
  it.each([
    '<feed xmlns="https://not-atom.example"><entry/></feed>',
    '<feed xmlns="http://www.w3.org/2005/Atom"><entry></feed>',
    '<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]><feed xmlns="http://www.w3.org/2005/Atom"/>',
    '<feed xmlns="http://www.w3.org/2005/Atom"><title>&unknown;</title></feed>',
    '<feed xmlns="http://www.w3.org/2005/Atom"><entry>',
  ])("fails closed on malformed or non-Atom XML", xml => {
    expect(() => parseBcbNotes(xml, day)).toThrow();
  });
});
