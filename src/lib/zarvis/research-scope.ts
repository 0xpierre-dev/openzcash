/** Topic routing only: these checks never establish a fact or a current measurement. */
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function isHistoricalQuestion(query: string): boolean {
  const q = normalize(query);
  if (/\bzips?\s*[-#]?\s*\d+\b/.test(q)) return false;
  return /\b(?:who is|who was|quem e|quem foi|biograph\w*|biograf\w*|trajetoria|carreira|career|ceremony|cerimonia|digicash|tahoe(?:-lafs)?|cypherpunks?)\b/.test(q)
    || /\b(?:history|historia)\b/.test(q) && /\b(?:zcash|zooko|satoshi|chaum|finney|snowden)\b/.test(q)
    || /^(?:(?:tell me about|fale sobre|me conte sobre) )?(?:zooko(?: wilcox)?|satoshi(?: nakamoto)?|edward snowden|hal finney|david chaum|daira(?:-emma)? hopwood)[?.!]*$/.test(q.trim());
}
export function isMiningQuestion(query: string): boolean {
  return /\b(?:hashrates?|hash rates?|hashpower|solrates?|mining|miners?|mineracao|mineradores?|dificuldade|difficulty|zcashinfo|zecstats)\b/.test(normalize(query));
}
export function needsMiningResearch(query: string): boolean {
  const q = normalize(query);
  return isMiningQuestion(q) && (/\b(?:current|latest|today|now|atual|atualmente|hoje|agora|ultim[oa]s?|recent\w*|20\d{2})\b/.test(q)
    || /\b(?:what is|what's|qual|quanto|how much|how many)\b.*\b(?:hashrates?|solrates?|difficulty|dificuldade)\b/.test(q)
    || /\b(?:24\s*h(?:ours?|oras?)?|last week|ultima semana|pool shares?|participacao dos pools)\b/.test(q));
}
export type ResearchScope = "general" | "zip" | "mining" | "history" | "governance" | "news";
/** Picks the domain set for hosted search; Grok accepts at most five, so governance/funding and news questions get their own lists. */
export function researchScope(query: string): ResearchScope {
  const q = normalize(query);
  if (/\bzips?\b/.test(q)) return "zip";
  if (isMiningQuestion(q)) return "mining";
  if (isHistoricalQuestion(q)) return "history";
  if (/\b(?:news|noticias?|announce\w*|anuncio\w*|blog|roadmap|release\w*|lancamento\w*|launch\w*|partnership\w*|parceria\w*)\b/.test(q)) return "news";
  if (/\b(?:zcg|grants?|treasur\w*|tesour\w*|lockbox|dev ?fund|funding|financiamento|governance|governanca|vot\w*|poll|enquete|coinholders?|nu\d(?:\.\d)?|upgrade|proposals?|propostas?|zfnd|foundation|fundacao|ecc|electric coin|bootstrap|committee|comite|elections?|eleicoes|eleicao)\b/.test(q)) return "governance";
  return "general";
}
