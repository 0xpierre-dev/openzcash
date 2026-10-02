import "server-only";
import { z } from "zod";
import { readMonthlyProjectActivity } from "@/lib/project-history/data";
import type { MonthlyProjectActivity } from "@/lib/project-history/activity";
import { historyAmount } from "@/lib/project-history/format";
import { boundedRead } from "./timeout";
import { normalizeQuestion, pick, type DirectLanguage } from "./language";
import type { Evidence } from "./local";

const monthSchema = z.object({ month: z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])$/) }).strict();
export const projectActivityTool = {
  type: "function" as const, name: "query_project_activity", strict: true,
  description: "Cross-project monthly funding and work evidence. Uses a complete paid ledger, exact project associations, month-specific payments, dated releases/reports and acceptance evidence. month is UTC YYYY-MM, current or past. This month means the current partial month, not the last closed month. Work coverage is incomplete. Shared award amounts are not project allocations; never sum project cards.",
  parameters: { type: "object", properties: { month: { type: "string" } }, required: ["month"], additionalProperties: false },
};

/** A single explicit calendar month, not an inferred comparison or arbitrary date range. */
export function projectActivityMonth(question: string, now = new Date()): string | undefined {
  const q = normalizeQuestion(question);
  if (!/\b(?:projects|projetos|proyectos)\b/.test(q) || !/\b(?:funded|funding|financiad\w*|grants|payments|pagamentos|recibieron)\b/.test(q)
    || !/\b(?:updates|atualizacoes|actualizaciones|releases|evidence|evidencias|entreg\w*|delivered|shipped)\b/.test(q)) return;
  if (/\b(?:why|por que|porque|impact|impacto|assess|evaluate|avalie|explain|explique|failed|falhou|compare|comparar|versus|vs|between|entre|since|desde|quarter|trimestre|semana|week|hoje|today|ayer|ontem|yesterday)\b/.test(q)) return;
  // This shortcut covers the whole recorded cohort, not a program/category/name filter.
  if (/\b(?:only|apenas|somente|solo|zcg|coinholders?|wallets?|carteiras?|communities|comunidades|infrastructure|infraestrutura|zaino|zingo|zebra|zechub)\b/.test(q)) return;
  const months = new Set<string>();
  for (const match of question.matchAll(/\b(20\d{2}-(?:0[1-9]|1[0-2]))\b/g)) months.add(match[1]);
  const yearTokens = [...q.matchAll(/\b20\d{2}\b/g)].map(m => m[0]);
  if (new Set(yearTokens).size > 1) return;
  const year = yearTokens[0] ?? String(now.getUTCFullYear());
  const names = ["january|janeiro|enero", "february|fevereiro|febrero", "march|marco|marzo", "april|abril", "may|maio|mayo", "june|junho|junio", "july|julho|julio", "august|agosto", "september|setembro|septiembre", "october|outubro|octubre", "november|novembro|noviembre", "december|dezembro|diciembre"];
  names.forEach((name, index) => { if (new RegExp(`\\b(?:${name})\\b`).test(q)) months.add(`${year}-${String(index + 1).padStart(2, "0")}`); });
  if (/\b(?:this month|current month|neste mes|nesse mes|este mes|mes atual)\b/.test(q)) months.add(now.toISOString().slice(0, 7));
  if (/\b(?:last month|last closed month|previous month|mes passado|ultimo mes fechado|mes anterior|mes anterior cerrado)\b/.test(q)) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)); months.add(date.toISOString().slice(0, 7));
  }
  // Day-level requests must reach the model rather than becoming full-month totals.
  const stripped = question.replace(/20\d{2}-(?:0[1-9]|1[0-2])/g, "").replace(/\b20\d{2}\b/g, "");
  if (/\d/.test(stripped) || months.size !== 1) return;
  const month = [...months][0];
  return month <= now.toISOString().slice(0, 7) ? month : undefined;
}

export async function lookupProjectActivity(raw: unknown, signal: AbortSignal): Promise<Evidence> {
  signal.throwIfAborted();
  const parsed = monthSchema.safeParse(raw);
  if (!parsed.success || parsed.data.month > new Date().toISOString().slice(0, 7)) return { content: JSON.stringify({ error: "Use one current or past YYYY-MM month." }) };
  const url = `https://openzcash.org/api/project-activity?month=${parsed.data.month}`;
  try {
    const full = await boundedRead(() => readMonthlyProjectActivity(parsed.data.month), signal, 9000);
    signal.throwIfAborted();
    const data = { ...full, projects: full.projects.slice(0, 12).map(project => ({ ...project,
      workCount: project.work.length, work: project.work.slice(0, 4),
      payments: project.payments.slice(0, 4),
    })), excerpt: { projectsShown: Math.min(full.projects.length, 12), projectCount: full.projects.length, workPerProjectLimit: 4, paymentPerProjectLimit: 4, completeRecordUrl: url } };
    return { content: JSON.stringify({ data, sourceUrl: url }), source: { title: `OpenZcash · project activity · ${parsed.data.month}`, url, retrievedAt: full.assembledAt } };
  } catch { signal.throwIfAborted(); return { content: JSON.stringify({ error: "Monthly project activity is unavailable. Do not infer zero funding or no work." }), source: { title: "Project histories", url: "https://openzcash.org/ecosystem/history" } }; }
}

type ActivityExcerpt = Omit<MonthlyProjectActivity, "projects"> & { projects: (MonthlyProjectActivity["projects"][number] & { workCount: number })[]; excerpt: { completeRecordUrl: string; projectCount: number } };
const clean = (text: string) => text.replace(/[\[\]()*_`<>\n\r]/g, " ").trim();
export function projectActivityAnswer(result: Evidence, lang: DirectLanguage): string {
  const data = JSON.parse(result.content).data as ActivityExcerpt | undefined;
  if (!data?.ledger) return pick(lang, { en: "The payment ledger is unavailable, so I cannot establish this month's funded-project cohort or amounts. This is not a zero total. [Project histories](https://openzcash.org/ecosystem/history).", pt: "O registro de pagamentos está indisponível; não consigo confirmar o conjunto de projetos financiados nem os valores do mês. Isso não significa total zero. [Fichas dos projetos](https://openzcash.org/ecosystem/history).", es: "El registro de pagos no está disponible; no puedo confirmar los proyectos financiados ni los importes del mes. No significa un total cero. [Historiales](https://openzcash.org/ecosystem/history)." });
  const { ledger, period, coverage } = data;
  const periodLabel = `${period.month}${period.partial ? pick(lang, { en: ` · partial through ${period.cutoff.slice(0, 10)} UTC`, pt: ` · parcial até ${period.cutoff.slice(0, 10)} UTC`, es: ` · parcial hasta ${period.cutoff.slice(0, 10)} UTC` }) : pick(lang, { en: " · closed calendar month (UTC)", pt: " · mês calendário fechado (UTC)", es: " · mes calendario cerrado (UTC)" })}`;
  const unknown = pick(lang, { en: "amount not recorded", pt: "valor não registrado", es: "importe no registrado" });
  const usd = (amount: string | null) => amount === null ? unknown : historyAmount(amount);
  const line = (project: ActivityExcerpt["projects"][number], withWork: boolean) => {
    const a = project.amounts;
    const paid = a.paidEntries ? `${usd(a.budgetUsdCents)}${a.missingUsd ? pick(lang, { en: " (incomplete)", pt: " (incompleto)", es: " (incompleto)" }) : ""}${a.recordedZecZat !== null ? ` / ${historyAmount(a.recordedZecZat, "ZEC")}${a.missingZec ? "*" : ""}` : ""}` : pick(lang, { en: "no dated payment linked in this month", pt: "sem pagamento datado vinculado neste mês", es: "sin pago fechado vinculado este mes" });
    const shared = project.sharedGrants.length ? pick(lang, { en: " Shared award; no project allocation.", pt: " Grant compartilhado; sem alocação individual.", es: " Grant compartido; sin asignación individual." }) : "";
    const work = withWork ? project.work.slice(0, 2).map(event => `[${clean(event.title)}](${event.source.url}) (${event.date!.slice(0, 10)})`).join("; ") : pick(lang, { en: "No dated work evidence linked for this month.", pt: "Sem evidência datada de trabalho vinculada ao mês.", es: "Sin evidencia de trabajo fechada vinculada al mes." });
    const ledgerLink = project.payments[0] ? ` [${pick(lang, { en: "Payment", pt: "Pagamento", es: "Pago" })}](${project.payments[0].source.url})` : "";
    return `- **[${clean(project.name)}](${project.url})** — ${paid}.${ledgerLink}${shared} ${work}`;
  };
  const funded = data.projects.filter(project => project.workCount > 0), pending = data.projects.filter(project => !project.workCount);
  const workHeading = pick(lang, { en: "Funded projects with dated work", pt: "Projetos financiados com trabalho documentado no mês", es: "Proyectos financiados con trabajo documentado en el mes" });
  const paymentHeading = pick(lang, { en: `Payments with a work-evidence gap · showing ${Math.min(pending.length, 4)} of ${coverage.paidWithoutDatedWork}`, pt: `Pagamentos com lacuna de evidência de trabalho · ${Math.min(pending.length, 4)} de ${coverage.paidWithoutDatedWork}`, es: `Pagos con brechas de evidencia de trabajo · ${Math.min(pending.length, 4)} de ${coverage.paidWithoutDatedWork}` });
  const intro = pick(lang, {
    en: `The ZCG + Coinholder ledger records **${ledger.paidEntries} paid entries**${ledger.budgetUsdCents !== null ? `, totaling **${usd(ledger.budgetUsdCents)}** in historical USD budget values` : ""}. ${coverage.fundedWithWork} funded project profiles have dated work linked to this month.`,
    pt: `O registro de ZCG + Coinholders tem **${ledger.paidEntries} lançamentos pagos**${ledger.budgetUsdCents !== null ? `, somando **${usd(ledger.budgetUsdCents)}** em valores históricos orçados em USD` : ""}. ${coverage.fundedWithWork} fichas de projetos financiados têm trabalho datado vinculado ao mês.`,
    es: `El registro de ZCG + Coinholders tiene **${ledger.paidEntries} entradas pagadas**${ledger.budgetUsdCents !== null ? `, con **${usd(ledger.budgetUsdCents)}** en valores históricos presupuestados en USD` : ""}. ${coverage.fundedWithWork} perfiles de proyectos financiados tienen trabajo fechado vinculado al mes.`,
  });
  const missing = ledger.missingUsd || ledger.missingZec ? pick(lang, { en: ` Missing amounts: ${ledger.missingUsd} USD / ${ledger.missingZec} ZEC entries; affected sums are incomplete.`, pt: ` Valores ausentes: ${ledger.missingUsd} registros USD / ${ledger.missingZec} ZEC; as somas afetadas são incompletas.`, es: ` Importes ausentes: ${ledger.missingUsd} registros USD / ${ledger.missingZec} ZEC; las sumas afectadas son incompletas.` }) : "";
  const scope = pick(lang, {
    en: `Amounts next to each project cover only ${period.month}; funding may predate the month. USD budgets and recorded ZEC disbursements are separate measures. Shared awards appear once in the ledger total; do not add project rows.`,
    pt: `Os valores ao lado de cada projeto cobrem apenas ${period.month}; o financiamento pode ser anterior. Orçamento em USD e desembolso registrado em ZEC são medidas distintas. Grants compartilhados entram uma vez no total; não some as linhas dos projetos.`,
    es: `Los importes de cada proyecto cubren solo ${period.month}; la financiación puede ser anterior. Presupuesto en USD y desembolso registrado en ZEC son medidas distintas. Los grants compartidos aparecen una vez en el total; no sumes las filas de proyectos.`,
  });
  const limits = pick(lang, {
    en: `**Evidence coverage:** repository base ${data.repositorySnapshotAt?.slice(0, 10) ?? "unavailable"}, plus individually reviewed additions; ledger imported ${data.ledgerImportedAt?.slice(0, 10) ?? "unavailable"}. ${coverage.unassociatedPaymentEntries} payment entries are not linked to a reviewed project identity; ${coverage.paidEntriesWithoutValidDate} paid entries lack a valid date and are excluded from month totals. Missing work records do not establish non-delivery. A release or payment does not establish milestone acceptance.`,
    pt: `**Cobertura:** base de repositórios de ${data.repositorySnapshotAt?.slice(0, 10) ?? "data indisponível"}, com adições revisadas; registro financeiro importado em ${data.ledgerImportedAt?.slice(0, 10) ?? "data indisponível"}. ${coverage.unassociatedPaymentEntries} pagamentos do mês não estão associados a uma identidade revisada; ${coverage.paidEntriesWithoutValidDate} lançamentos pagos não têm data válida e ficam fora dos totais mensais. Ausência de registro de trabalho não prova falta de entrega. Release ou pagamento não comprova aceite do marco.`,
    es: `**Cobertura:** base de repositorios del ${data.repositorySnapshotAt?.slice(0, 10) ?? "fecha no disponible"}, con adiciones revisadas; registro financiero importado el ${data.ledgerImportedAt?.slice(0, 10) ?? "fecha no disponible"}. ${coverage.unassociatedPaymentEntries} pagos del mes no están asociados a una identidad revisada; ${coverage.paidEntriesWithoutValidDate} entradas pagadas carecen de fecha válida y se excluyen de los totales mensuales. La falta de registros no prueba falta de entrega. Un release o pago no demuestra la aceptación del hito.`,
  });
  const empty = pick(lang, { en: "No dated work is linked for this month in the current corpus. That does not mean no project shipped.", pt: "O acervo atual ainda não vincula trabalho datado a este mês. Isso não significa que nenhum projeto entregou.", es: "El acervo actual todavía no vincula trabajo fechado a este mes. No significa que ningún proyecto haya entregado." });
  const full = pick(lang, { en: "Complete monthly records", pt: "Registros completos do mês", es: "Registros completos del mes" });
  return `**${periodLabel}**\n\n${intro}${missing}\n\n**${workHeading} (${Math.min(funded.length, 6)}/${coverage.fundedWithWork})**\n\n${funded.length ? funded.slice(0, 6).map(p => line(p, true)).join("\n") : empty}${pending.length ? `\n\n**${paymentHeading}**\n\n${pending.slice(0, 4).map(p => line(p, false)).join("\n")}` : ""}\n\n${scope}\n\n${limits}\n\n[${full}](${data.excerpt.completeRecordUrl}) · [${pick(lang, { en: "Project histories", pt: "Fichas dos projetos", es: "Historiales" })}](https://openzcash.org/ecosystem/history).`;
}
