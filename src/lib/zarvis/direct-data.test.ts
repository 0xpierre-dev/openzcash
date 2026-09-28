import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { treasuryAnswer, numberedZipAnswer } from "./direct-data";
import { bundledZipCorpus } from "./knowledge";
import { valueReportedDevFund } from "@/lib/treasury/dev-fund";
const now = () => new Date().toISOString();
const data = () => ({ funds: {
  zcg: { zec: 10.001, cashUsd: 50, paidMilestonesUsd: 9999999, sourceUrl: "https://openzcash.org/zcg/reconciliation", snapshotAt: "2026-09-16T00:00:00Z", importedAt: now(), updatesRequired: true },
  lockbox: { estimatedZec: 20.001, estimateThroughBlock: 3493051, sourceAnchorBlock: 3400000, sourceAnchorDate: "2026-09-01T00:00:00Z", importedAt: now(), updatesRequired: false },
}, price: { cents: 12345, quotedAt: now(), stale: false } });
const corpus = () => ({ ...bundledZipCorpus, retrievedAt: now() });

describe("Deterministic treasury facts", () => {
  it("keeps cash, past spending, quote and two separate pools distinct; rounds like the footer", () => {
    const d = data();
    const text = treasuryAnswer(JSON.stringify({ data: d }), "both", "en");
    const value = valueReportedDevFund({ zcg: d.funds.zcg, lockbox: { ...d.funds.lockbox, zec: d.funds.lockbox.estimatedZec, height: 3493051, baselineHeight: 3400000, snapshotAt: "2026-09-01", sourceUrl: "https://openzcash.org/lockbox" } }, 123.45);
    expect(text).toContain(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value!));
    expect(text).toContain("$123.45 per ZEC"); expect(text).toContain("$50.00 USD cash");
    expect(text).not.toContain("9,999,999"); expect(text).toContain("3,493,051");
    expect(text).toContain("not a fresh wallet reading"); expect(text).toContain("Later outflows");
    expect(text).toContain("needing updates"); expect(text).toContain("separate spending restrictions");
  });
  it("does not include the other pool in a single-fund valuation", () => {
    const text = treasuryAnswer(JSON.stringify({ data: data() }), "zcg", "en");
    expect(text).toContain("gross value: $1,284.62"); expect(text).not.toContain("Lockbox — estimate");
  });
  it.each(["{}", "bad json", '{"data":{"funds":{"zcg":null,"lockbox":null}}}'])("does not turn absent data into zero: %s", (content) => {
    const text = treasuryAnswer(content, "both", "en");
    expect(text).toContain("unavailable"); expect(text).not.toMatch(/NaN|\$0\.00|gross value:/);
  });
  it("does not combine incomplete holdings or an unknown cash amount", () => {
    const d = data();
    const content = JSON.stringify({ data: { ...d, funds: { ...d.funds, zcg: { ...d.funds.zcg, cashUsd: null } } } });
    expect(treasuryAnswer(content, "both", "en")).toContain("USD cash not reported");
    expect(treasuryAnswer(content, "both", "en")).not.toContain("gross value:");
  });
  it.each([null, { cents: 10000, quotedAt: null, stale: false }, { cents: 10000, quotedAt: "2200-01-01", stale: false }])("does not price holdings using an invalid quote: %j", (price) => {
    expect(treasuryAnswer(JSON.stringify({ data: { ...data(), price } }), "both", "en")).toContain("valid USD quote is unavailable");
  });
  it("states how old the report, import, anchor and quote are at answer time, in both languages", () => {
    vi.useFakeTimers({ now: new Date("2026-09-28T12:00:00Z") });
    try {
      const d = data();
      d.funds.zcg.snapshotAt = "2026-09-23T20:16:00Z"; d.funds.zcg.importedAt = "2026-09-28T10:30:00Z";
      d.funds.lockbox.sourceAnchorDate = "2026-09-23T20:16:00Z"; d.funds.lockbox.importedAt = "2026-09-27T03:00:00Z";
      d.price.quotedAt = "2026-09-28T11:59:40Z";
      const content = JSON.stringify({ data: d });
      const en = treasuryAnswer(content, "both", "en");
      expect(en).toMatch(/Report dated .*\(4 days ago\); imported .*\(1 hour ago\)\./);
      expect(en).toMatch(/Anchor: block 3,400,000, report dated .*\(4 days ago\); imported .*\(1 day ago\)\./);
      expect(en).toContain("through block 3,493,051 as of this answer"); expect(en).toMatch(/quoted .*\(less than a minute ago\)\./);
      expect(en).not.toContain("cached; not confirmed current");
      const pt = treasuryAnswer(content, "both", "pt");
      expect(pt).toMatch(/Relatório de .*\(há 4 dias\); importado em .*\(há 1 hora\)\./);
      expect(pt).toMatch(/importado em .*\(há 1 dia\)\./); expect(pt).toContain("(há menos de um minuto)");
      const es = treasuryAnswer(content, "both", "es");
      expect(es).toMatch(/Informe con fecha 23 sept 2026, 8:16 p\.m\. UTC \(hace 4 días\); importado el 28 sept 2026, 10:30 a\.m\. UTC \(hace 1 hora\)\./);
      expect(es).toMatch(/Referencia: bloque 3,400,000, informe con fecha .*\(hace 4 días\); importado el .*\(hace 1 día\)\./);
      expect(es).toContain("hasta el bloque 3,493,051 al momento de esta respuesta"); expect(es).toMatch(/cotización del .*\(hace menos de un minuto\)\./);
      expect(es).toMatch(/\*\*ZCG — saldo reportado:\*\* 10\.001 ZEC \+ USD\s50\.00 en efectivo USD\./); expect(es).toContain("**Lockbox — estimación:** 20.001 ZEC hasta el bloque **3,493,051**.");
      expect(es).toMatch(/\*\*Valor bruto estimado combinado: USD\s[\d,]+\.\d{2}\*\*, usando USD\s123\.45 por ZEC/);
      expect(es).toContain("pendiente de actualización"); expect(es).toContain("restricciones de gasto separadas"); expect(es).not.toContain("en caché");
      expect(es).toContain("[ZCG · sources and balances](https://openzcash.org/zcg/reconciliation)"); expect(es).toContain("[Lockbox · estimate](https://openzcash.org/lockbox)");
    } finally { vi.useRealTimers(); }
  });
  it("marks cached valuations explicitly and provides Portuguese output", () => {
    const d = data(); d.price.quotedAt = "2026-01-01T00:00:00Z";
    const content = JSON.stringify({ data: d });
    expect(treasuryAnswer(content, "both", "en")).toContain("cached; not confirmed current");
    expect(treasuryAnswer(content, "both", "pt")).toContain("não confirmada como atual");
    expect(treasuryAnswer(content, "both", "es")).toContain("(en caché; no confirmada como actual)");
  });
  it("keeps Spanish outage and incomplete-data caveats free of invented zeros", () => {
    const missing = treasuryAnswer('{"data":{"funds":{"zcg":null,"lockbox":null}}}', "both", "es");
    expect(missing).toContain("El saldo reportado de ZCG no está disponible; eso no significa saldo cero."); expect(missing).toContain("La estimación del Lockbox no está disponible; eso no significa saldo cero.");
    expect(missing).not.toMatch(/NaN|USD\s0\.00|Valor bruto estimado/);
    const d = data();
    const partial = treasuryAnswer(JSON.stringify({ data: { ...d, funds: { ...d.funds, zcg: { ...d.funds.zcg, cashUsd: null } } } }), "both", "es");
    expect(partial).toContain("efectivo en USD no informado"); expect(partial).not.toContain("Valor bruto estimado");
    expect(treasuryAnswer(JSON.stringify({ data: { ...data(), price: null } }), "zcg", "es")).toContain("No hay una cotización válida en USD para valorar estos saldos.");
  });
});

describe("Official numbered ZIP excerpts", () => {
  it("keeps exact numbers and revision-specific status, not an activation claim", () => {
    const c = corpus(); const d = c.documents.find((d) => d.number === 317)!;
    const answer = numberedZipAnswer(317, true, c, false, "en")!;
    expect(answer).toContain(d.sourceUrl); expect(answer).toContain("ZIP 317");
    expect(answer).toContain("Revision 0"); expect(answer).toContain("Revision 1");
    expect(answer).toContain("does not establish network activation"); expect(answer).toContain("Official abstract excerpt");
  });
  it.each([
    "Abstract\n========\n\nFirst official line\nand its continuation.\n\nSecond paragraph.",
    "# Abstract\n\nFirst official line\nand its continuation.\n\nSecond paragraph.",
  ])("extracts only a bounded first abstract paragraph", (text) => {
    const c = corpus(); c.documents = c.documents.map(d => d.number === 317 ? { ...d, text } : d);
    const answer = numberedZipAnswer(317, true, c, false, "pt")!;
    expect(answer).toContain("First official line and its continuation."); expect(answer).not.toContain("Second paragraph"); expect(answer).toContain("em inglês");
    expect(numberedZipAnswer(317, false, c, false, "en")).not.toContain("abstract excerpt");
    const es = numberedZipAnswer(317, true, c, false, "es")!;
    expect(es).toContain("First official line and its continuation."); expect(es).toContain("Extracto del resumen oficial (en inglés)"); expect(es).toContain("Estado en el documento:");
    expect(es).toContain("Created es la fecha de creación declarada, no la primera publicación. El estado del documento no comprueba la activación en la red.");
    expect(numberedZipAnswer(317, false, c, false, "es")).not.toContain("resumen oficial");
  });
  it("does not invent a missing abstract, date, unknown ZIP or stale status", () => {
    const c = corpus(); c.documents = c.documents.map(d => d.number === 317 ? { ...d, text: "Reserved", createdOn: null } : d);
    expect(numberedZipAnswer(317, true, c, false, "en")).toContain("not specified");
    expect(numberedZipAnswer(317, true, c, false, "es")).toContain("Created: **no informado**");
    expect(numberedZipAnswer(317, true, c, false, "en")).not.toContain("abstract excerpt");
    expect(numberedZipAnswer(99999, true, c, false, "en")).toBeUndefined();
    expect(numberedZipAnswer(317, true, c, true, "en")).toBeUndefined();
  });
  it("rejects unsafe citations", () => {
    const c = corpus(); c.documents = c.documents.map(d => d.number === 317 ? { ...d, sourceUrl: "https://attacker.example/zip" } : d);
    expect(numberedZipAnswer(317, true, c, false, "en")).toBeUndefined();
  });
});
