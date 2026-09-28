import {
  proposalDecisions,
  sortDecisions,
  type DecisionRow,
  type MeetingInput,
  type ProposalInput,
} from "@/lib/governance/decisions";
import { proposalStatusLabel } from "@/lib/zcg/status-labels";
import { terms } from "./sources";

export const DECISION_ROWS = 10;
export type ProposalRecord = ProposalInput & {
  submittedDate: string | null;
  importedAt?: Date | string | null;
};
const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const OUTCOMES: Array<[RegExp, string]> = [
  [
    /\b(?:approved|aprovad\w*|accepted|aceit\w*|funded|financiad\w*)\b/,
    "Approved",
  ],
  [
    /\b(?:rejected|rejeitad\w*|declined|recusad\w*|denied|negad\w*)\b/,
    "Rejected",
  ],
  [/\b(?:withdrawn|withdrew|retirad\w*|desistiu)\b/, "Withdrawn"],
  [/\b(?:cancell?ed|cancelad\w*)\b/, "Cancelled"],
  [/\b(?:filtered|filtrad\w*|not considered)\b/, "Filtered"],
  [/\b(?:vetoed|veto|vetad\w*)\b/, "Vetoed"],
];
const NOISE = new Set(
  "proposal proposals proposta propostas decision decisions decisao decisoes verdict verdicts approved rejected declined withdrawn filtered vetoed cancelled aprovadas aprovados rejeitadas recusadas retiradas grant grants zcg coinholder coinholders fpf program programa committee comite which quais what qual were foram been recently recent recentes latest last ultimas ultimos month mes year ano this este esse happened aconteceu".split(
    " ",
  ),
);

/** Applicant withdrawals and cancellations are dated events too, but not committee verdicts. */
function applicantRows(proposals: ProposalRecord[]): DecisionRow[] {
  return proposals.flatMap((p) => {
    const date = p.decisionDate ?? p.submittedDate;
    if (!date || !["withdrawn", "cancelled"].includes(p.status)) return [];
    return [
      {
        id: `proposal-${p.id}`,
        date,
        process: (p.program === "coinholder"
          ? "coinholders"
          : "committee") as DecisionRow["process"],
        outcome: proposalStatusLabel(p.status),
        tone: "zinc" as const,
        subject: p.title,
        subjectHref: null,
        detail: p.applicantsRaw,
        decidedBy: "Applicant",
        sources: p.platformLink
          ? [{ label: "Application", href: p.platformLink }]
          : [],
      },
    ];
  });
}
type Meta = { publishedThrough: string };
/** Dated ZCG and coinholder verdicts with their application and minutes links, newest first, filtered by the question's outcome, year, program and words. */
export function decisionsContext(
  proposals: ProposalRecord[],
  meetings: MeetingInput[],
  grantKeys: string[],
  query: string,
  meta: Meta,
) {
  const q = normalize(query);
  const outcome = OUTCOMES.find(([pattern]) => pattern.test(q))?.[1] ?? null;
  const year = q.match(/\b(20[12]\d)\b/)?.[1] ?? null;
  const program = /\bcoinholder/.test(q)
    ? "coinholders"
    : /\b(?:zcg|committee|comite)\b/.test(q)
      ? "committee"
      : null;
  const words = terms(q).filter((t) => !NOISE.has(t) && !/^\d+$/.test(t));
  const rows = sortDecisions([
    ...proposalDecisions(proposals, meetings, grantKeys),
    ...applicantRows(proposals),
  ]);
  const score = (r: DecisionRow) => {
    const hay = normalize(`${r.subject} ${r.detail ?? ""}`);
    return words.reduce((n, t) => n + Number(hay.includes(t)), 0);
  };
  const matched = rows
    .filter(
      (r) =>
        (!outcome || r.outcome === outcome) &&
        (!year || r.date.startsWith(year)) &&
        (!program || r.process === program) &&
        (!words.length || score(r) > 0),
    )
    .sort(
      (a, b) =>
        (words.length ? score(b) - score(a) : 0) ||
        b.date.localeCompare(a.date),
    );
  const counts: Record<string, number> = {};
  for (const p of proposals)
    counts[`${p.program}:${proposalStatusLabel(p.status)}`] =
      (counts[`${p.program}:${proposalStatusLabel(p.status)}`] ?? 0) + 1;
  const importedAt = proposals.reduce<string | null>((latest, p) => {
    const at = p.importedAt ? new Date(p.importedAt).toISOString() : null;
    return at && (!latest || at > latest) ? at : latest;
  }, null);
  return {
    publishedThrough: meta.publishedThrough,
    importedAt,
    totalProposals: proposals.length,
    totalDecisions: rows.length,
    latestDecisionDate: rows[0]?.date ?? null,
    statusCounts: counts,
    filter: { outcome, year, program, words },
    matched: matched.length,
    decisions: matched.slice(0, DECISION_ROWS).map((r) => ({
      date: r.date,
      outcome: r.outcome,
      process: r.process,
      subject: r.subject,
      detail: r.detail,
      decidedBy: r.decidedBy,
      sources: r.sources,
      grantPage: r.subjectHref ? `https://openzcash.org${r.subjectHref}` : null,
    })),
    note: "Verdicts and dates come from the official ZCG sheet under the site's D-1 publication rule (publishedThrough is the last published day); status changes after that day are not shown. Committee verdicts link the minutes of that day when one exists; coinholder rows come from FPF polls. Withdrawn and cancelled rows are the applicant's own choice, dated by the sheet's decision or submission date. A verdict is not a payment or proof of delivery. Counts cover the whole sheet; the decisions array is an excerpt.",
  };
}
