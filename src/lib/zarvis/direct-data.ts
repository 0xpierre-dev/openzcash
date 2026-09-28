import { z } from "zod";
import { locale, pick, type DirectLanguage } from "./language";
import { safeSourceUrl } from "./sources";
import type { ZipCorpus } from "./zip-source";

const amount = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER / 100);
const dated = z.string().refine((s) => Number.isFinite(Date.parse(s)) && Date.parse(s) <= Date.now() + 60_000);
const zcgSchema = z.object({ zec: amount.nullable(), cashUsd: amount.nullable(), snapshotAt: dated, importedAt: dated, updatesRequired: z.boolean() });
const lockboxSchema = z.object({ estimatedZec: amount, estimateThroughBlock: z.number().int().positive(), sourceAnchorBlock: z.number().int().positive(), sourceAnchorDate: dated, importedAt: dated, updatesRequired: z.boolean() });
const quoteSchema = z.object({ cents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), quotedAt: dated, stale: z.boolean() });
const time = (s: string, lang: DirectLanguage) => new Intl.DateTimeFormat(locale(lang), { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }).format(new Date(s)) + " UTC";
/** Age at answer time, so "how old are the data" is answered without the reader subtracting UTC stamps. */
const age = (s: string, lang: DirectLanguage) => {
  const ms = Date.now() - Date.parse(s);
  if (ms < 60_000) return pick(lang, { en: "less than a minute ago", pt: "há menos de um minuto", es: "hace menos de un minuto" });
  const [unit, size] = ([["day", 86_400_000], ["hour", 3_600_000]] as const).find(([, size]) => ms >= size) ?? ["minute", 60_000];
  return new Intl.RelativeTimeFormat(locale(lang), { numeric: "always" }).format(-Math.floor(ms / size), unit);
};
const stamp = (s: string, lang: DirectLanguage) => `${time(s, lang)} (${age(s, lang)})`;
const plain = (s: string) => s.replace(/[\\[\]<>*`|]/g, "").replace(/\s+/g, " ").trim();

/** Render only validated fields, never missing values as zero or a report timestamp as a live quote. */
export function treasuryAnswer(content: string, fund: "zcg" | "lockbox" | "both", lang: DirectLanguage): string {
  const n = (v: number) => new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 8 }).format(v);
  const usd = (v: number) => new Intl.NumberFormat(locale(lang), { style: "currency", currency: "USD" }).format(v);
  const t = <T,>(texts: { en: T; pt: T; es: T }) => pick(lang, texts);
  let data;
  try { data = JSON.parse(content).data; } catch { /* handled as unavailable */ }
  const zcg = zcgSchema.safeParse(data?.funds?.zcg);
  const lockbox = lockboxSchema.safeParse(data?.funds?.lockbox);
  const quote = quoteSchema.safeParse(data?.price);
  const lines: string[] = [];
  const pools: number[] = [];
  let cash = 0, complete = true;
  if (fund !== "lockbox") {
    if (zcg.success) {
      const d = zcg.data;
      const zec = d.zec === null ? t({ en: "ZEC not reported", pt: "ZEC não informado", es: "ZEC no informado" }) : `${n(d.zec)} ZEC`;
      const cashUsd = d.cashUsd === null ? t({ en: "USD cash not reported", pt: "caixa em USD não informado", es: "efectivo en USD no informado" }) : t({ en: `${usd(d.cashUsd)} USD cash`, pt: `${usd(d.cashUsd)} em caixa USD`, es: `${usd(d.cashUsd)} en efectivo USD` });
      lines.push(t({ en: `**ZCG — reported holdings:** ${zec} + ${cashUsd}.`, pt: `**ZCG — saldo reportado:** ${zec} + ${cashUsd}.`, es: `**ZCG — saldo reportado:** ${zec} + ${cashUsd}.` }));
      lines.push(t({ en: `Report dated ${stamp(d.snapshotAt, lang)}; imported ${stamp(d.importedAt, lang)}.`, pt: `Relatório de ${stamp(d.snapshotAt, lang)}; importado em ${stamp(d.importedAt, lang)}.`, es: `Informe con fecha ${stamp(d.snapshotAt, lang)}; importado el ${stamp(d.importedAt, lang)}.` }));
      if (d.updatesRequired) lines.push(t({ en: "The ZCG source is marked as needing updates.", pt: "A fonte do ZCG está marcada como precisando de atualização.", es: "La fuente de ZCG está marcada como pendiente de actualización." }));
      if (d.zec === null || d.cashUsd === null) complete = false;
      else { pools.push(d.zec); cash += d.cashUsd; }
    } else { complete = false; lines.push(t({ en: "Reported ZCG holdings are unavailable; this does not mean a zero balance.", pt: "O saldo reportado do ZCG está indisponível; isso não significa saldo zero.", es: "El saldo reportado de ZCG no está disponible; eso no significa saldo cero." })); }
  }
  if (fund !== "zcg") {
    if (lockbox.success) {
      const d = lockbox.data;
      lines.push(t({ en: `**Lockbox — estimate:** ${n(d.estimatedZec)} ZEC through block **${n(d.estimateThroughBlock)}**.`, pt: `**Lockbox — estimativa:** ${n(d.estimatedZec)} ZEC até o bloco **${n(d.estimateThroughBlock)}**.`, es: `**Lockbox — estimación:** ${n(d.estimatedZec)} ZEC hasta el bloque **${n(d.estimateThroughBlock)}**.` }));
      lines.push(t({
        en: `Anchor: block ${n(d.sourceAnchorBlock)}, report dated ${stamp(d.sourceAnchorDate, lang)}; imported ${stamp(d.importedAt, lang)}. The estimate adds scheduled block accruals through block ${n(d.estimateThroughBlock)} as of this answer; it is not a fresh wallet reading. Later outflows may require reconciliation.`,
        pt: `Referência: bloco ${n(d.sourceAnchorBlock)}, relatório de ${stamp(d.sourceAnchorDate, lang)}; importado em ${stamp(d.importedAt, lang)}. O saldo adiciona acúmulos programados por bloco até o bloco ${n(d.estimateThroughBlock)} no momento desta resposta; não é uma leitura atual de carteira. Saídas posteriores podem exigir reconciliação.`,
        es: `Referencia: bloque ${n(d.sourceAnchorBlock)}, informe con fecha ${stamp(d.sourceAnchorDate, lang)}; importado el ${stamp(d.importedAt, lang)}. La estimación suma acumulaciones programadas por bloque hasta el bloque ${n(d.estimateThroughBlock)} al momento de esta respuesta; no es una lectura actual de la billetera. Salidas posteriores pueden requerir conciliación.`,
      }));
      if (d.updatesRequired) lines.push(t({ en: "The Lockbox source is marked as needing updates.", pt: "A fonte do Lockbox está marcada como precisando de atualização.", es: "La fuente del Lockbox está marcada como pendiente de actualización." }));
      pools.push(d.estimatedZec);
    } else { complete = false; lines.push(t({ en: "The Lockbox estimate is unavailable; this does not mean a zero balance.", pt: "A estimativa do Lockbox está indisponível; isso não significa saldo zero.", es: "La estimación del Lockbox no está disponible; eso no significa saldo cero." })); }
  }
  if (quote.success && complete) {
    const q = quote.data;
    const value = (pools.reduce((sum, zec) => sum + Math.round(zec * (q.cents / 100) * 100), 0) + Math.round(cash * 100)) / 100;
    const stale = q.stale || Date.now() - Date.parse(q.quotedAt) >= 600_000;
    if (Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER / 100) {
      lines.push(t({
        en: `**Estimated ${fund === "both" ? "combined " : ""}gross value: ${usd(value)}**, using ${usd(q.cents / 100)} per ZEC, quoted ${stamp(q.quotedAt, lang)}${stale ? " (cached; not confirmed current)" : ""}.`,
        pt: `**Valor bruto estimado${fund === "both" ? " combinado" : ""}: ${usd(value)}**, usando ${usd(q.cents / 100)} por ZEC, cotação de ${stamp(q.quotedAt, lang)}${stale ? " (em cache; não confirmada como atual)" : ""}.`,
        es: `**Valor bruto estimado${fund === "both" ? " combinado" : ""}: ${usd(value)}**, usando ${usd(q.cents / 100)} por ZEC, cotización del ${stamp(q.quotedAt, lang)}${stale ? " (en caché; no confirmada como actual)" : ""}.`,
      }));
    }
  } else if (complete) lines.push(t({ en: "A valid USD quote is unavailable for valuing these holdings.", pt: "Não foi possível validar uma cotação em USD para valorar esses saldos.", es: "No hay una cotización válida en USD para valorar estos saldos." }));
  lines.push(t({
    en: "The market quote is not the report's price. ZCG and Lockbox have separate spending restrictions; gross value is not one pool of spendable cash.",
    pt: "A cotação de mercado não é a cotação do relatório. ZCG e Lockbox têm restrições de gasto separadas; valor bruto não equivale a um único caixa disponível.",
    es: "La cotización de mercado no es el precio del informe. ZCG y Lockbox tienen restricciones de gasto separadas; el valor bruto no equivale a un único fondo de efectivo disponible.",
  }));
  lines.push(...(fund !== "lockbox" ? ["[ZCG · sources and balances](https://openzcash.org/zcg/reconciliation)"] : []), ...(fund !== "zcg" ? ["[Lockbox · estimate](https://openzcash.org/lockbox)"] : []));
  return lines.join("\n\n");
}

export function numberedZipAnswer(number: number, overview: boolean, corpus: ZipCorpus, stale: boolean, lang: DirectLanguage): string | undefined {
  if (stale || !dated.safeParse(corpus.retrievedAt).success) return;
  const d = corpus.documents.find((item) => item.number === number);
  if (!d || !safeSourceUrl(d.sourceUrl)) return;
  const header = `**[ZIP ${number}: ${plain(d.title)}](${d.sourceUrl})**`;
  const updated = d.updatedOn ? ` Last-Updated: **${d.updatedOn}**.` : "";
  const status = pick(lang, {
    en: `Document status: **${plain(d.status)}**. Created: **${d.createdOn ?? "not specified"}**.${updated}`,
    pt: `Status no documento: **${plain(d.status)}**. Created: **${d.createdOn ?? "não informado"}**.${updated}`,
    es: `Estado en el documento: **${plain(d.status)}**. Created: **${d.createdOn ?? "no informado"}**.${updated}`,
  });
  // Quote the first official abstract paragraph; never fabricate a technical summary from a title.
  const paragraph = d.text.match(/(?:^|\n)(?:#{1,6} +Abstract[^\S\n]*\n|Abstract[^\S\n]*\n[=-]{3,}[^\S\n]*\n)\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*\n|$)/i)?.[1];
  const raw = paragraph ? plain(paragraph.replace(/\[(?:#|\^)[^\]]+\]_?/g, "")) : "";
  const abstract = raw.length > 600 ? raw.slice(0, 600).replace(/\s+\S*$/, "") + "…" : raw;
  const summary = overview && abstract ? `${pick(lang, { en: "Official abstract excerpt", pt: "Trecho do resumo oficial (em inglês)", es: "Extracto del resumen oficial (en inglés)" })}:\n> ${abstract}` : "";
  const provenance = pick(lang, {
    en: `Catalog checked ${time(corpus.retrievedAt, lang)}, revision ${corpus.revision.slice(0, 12)}. Created is the declared creation date, not first publication. Document status does not establish network activation.`,
    pt: `Catálogo verificado em ${time(corpus.retrievedAt, lang)}, revisão ${corpus.revision.slice(0, 12)}. Created é a data declarada de criação, não a primeira publicação. O status do documento não comprova ativação na rede.`,
    es: `Catálogo verificado el ${time(corpus.retrievedAt, lang)}, revisión ${corpus.revision.slice(0, 12)}. Created es la fecha de creación declarada, no la primera publicación. El estado del documento no comprueba la activación en la red.`,
  });
  return [header, status, summary, provenance].filter(Boolean).join("\n\n");
}
