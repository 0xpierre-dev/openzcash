import type { ZechubGovernance, ZechubProposal } from "@/lib/dao/zechub";

/** ZecHub DAO proposals (DAO DAO on Juno) filtered by what a question names: a proposal number, a status word or title words. Pure; the reader in src/lib/dao/zechub.ts fetches and caches. */
export const DAO_ROWS = 12;
export const DAO_NOTE = "ZecHub DAO proposals read from the public DAO DAO indexer, with direct Juno contract queries as a fallback, and cached about ten minutes; only the newest proposals are listed. Stale data reflects the last successful reading; unavailable data does not mean the DAO has no proposals. Creation dates are absent when unknown. Vote figures are voting-power tallies. A passed or executed proposal is a decision of the ZecHub DAO about its own funds, not a Zcash protocol, ZCG or Zcash Foundation decision. description, present for a short selection only, is the proposer's own text cut at a fixed length: amounts in it are what was proposed, not what was paid.";
const STATUS_WORDS: Record<string, string> = { open: "open", aberta: "open", abertas: "open", passed: "passed", aprovada: "passed", aprovadas: "passed", passou: "passed", executed: "executed", executada: "executed", executadas: "executed", rejected: "rejected", rejeitada: "rejected", rejeitadas: "rejected", closed: "closed", fechada: "closed", fechadas: "closed", expired: "closed" };
const NOISE = new Set("zechub zec hub dao daodao proposal proposals proposta propostas vote votes voted voting votacao votacoes latest last recent newest ultimo ultima ultimos ultimas which what how many quantas quais qual is are was were the a an of on in for to and or about sobre o os a as um uma de do da dos das no na e ou que status".split(" "));
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function daoFilter(query: string) {
  const q = normalize(query);
  const numbers = [...new Set([...q.matchAll(/(?:\ba|#|\bproposals?\s*#?|\bpropostas?\s*#?)\s*(\d{1,5})\b/g)].map((m) => Number(m[1])))];
  const words = q.match(/[a-z0-9][a-z0-9-]*/g) ?? [];
  const statuses = [...new Set(words.map((w) => STATUS_WORDS[w]).filter((s): s is string => Boolean(s)))];
  const tokens = words.filter((w) => !NOISE.has(w) && !(w in STATUS_WORDS) && !/^\d+$/.test(w) && w.length >= 3);
  return { numbers, statuses, tokens };
}
/** The proposer's text travels only with a short selection (a named proposal or a narrow match), so a listing stays a listing. */
export const DESCRIPTION_ROWS = 3;
const row = (p: ZechubProposal, withDescription: boolean) => ({ ref: p.ref, title: p.title, status: p.status, createdAt: p.createdAt, votes: { yes: p.yes, no: p.no, abstain: p.abstain }, url: p.url, ...(withDescription ? { description: p.description } : {}) });
export function daoContext(proposals: ZechubProposal[], query: string, meta: { url: string } & Pick<ZechubGovernance, "fetchedAt" | "status" | "source">) {
  const { numbers, statuses, tokens } = daoFilter(query);
  const score = (p: ZechubProposal) => { const hay = normalize(`${p.title} ${p.status}`); return tokens.reduce((n, t) => n + Number(hay.includes(t)), 0); };
  const selected = numbers.length ? proposals.filter((p) => numbers.includes(p.id))
    : statuses.length ? proposals.filter((p) => statuses.includes(normalize(p.status)))
      : tokens.length ? proposals.map((p) => ({ p, s: score(p) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.p)
        : proposals;
  const byStatus: Record<string, number> = {};
  for (const p of proposals) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
  const latest = proposals[0];
  return { daoFetchedAt: meta.fetchedAt, status: meta.status, source: meta.source, dao: meta.url, proposalsListed: meta.status === "unavailable" ? null : proposals.length, latestProposal: latest ? { ref: latest.ref, title: latest.title, status: latest.status, createdAt: latest.createdAt } : null, byStatus, filter: { numbers, statuses, words: tokens }, matched: selected.length, proposals: selected.slice(0, DAO_ROWS).map((p) => row(p, selected.length <= DESCRIPTION_ROWS)), note: DAO_NOTE };
}
