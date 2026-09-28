import { normalizeQuestion } from "./direct-intent";
import type { ZarvisSession } from "./session";
import type { ChatMessage } from "./types";

export type AnswerLanguage = "en" | "pt" | "other";
/** Function words plus the few domain nouns the direct templates accept. A word may count for several languages; only a strict majority decides. */
const words = {
  en: "what whats how the is are does do did and or in of for to an it its my this that these those where which who when with about much many can could should will was were has have had not no yes hi hello thanks thank explain price today now latest current treasury balance balances holdings paid grants viewing key keys",
  pt: "como onde quais qual quanto quantos quanta quantas sao esta estao foi tem ha saldo saldos dados dizem mostram que de do da dos das um uma o os as para com nao e em no na nos nas ao aos por mais sim ola oi obrigado obrigada valeu explique pagou pagaram preco cotacao custa hoje agora ultimo ultima atual atuais quando ela ele pode meus minha meu isso esse essa tesouro tesouraria carteiras chave chaves cenario cenarios vezes limitacoes",
  es: "como donde cuales cual cuanto cuantos son esta estan fue tiene hay saldo datos dicen muestran que de del al un una el los las la para con no y en si hola gracias explica precio cotizacion cuesta hoy ahora ultimo ultima actual actuales cuando puede mis mi eso ese esa tesoreria carteras billeteras clave claves escenario",
  fr: "comment ou quel quelle quels quelles combien est sont sera solde donnees disent montrent que de du des un une le les la pour avec pas ne et en dans sur oui bonjour merci prix cours coute aujourd'hui maintenant dernier derniere actuel actuelle quand peut mes mon ma cela ce cette tresorerie portefeuille cle cles scenario",
} as const;
type Known = keyof typeof words;
const lexicon = Object.fromEntries(Object.entries(words).map(([language, list]) => [language, new Set(list.split(" "))])) as Record<Known, Set<string>>;

/** The language of one turn when its own words decide it; ties and wordless turns ("2025", "ZIP 317") return undefined. */
export function questionLanguage(question: string): AnswerLanguage | undefined {
  const tokens = normalizeQuestion(question).replace(/[¿¡]/g, "").split(" ").filter(Boolean);
  const ranked = (Object.keys(lexicon) as Known[]).map((language) => [language, tokens.filter((token) => lexicon[language].has(token)).length] as const).sort((a, b) => b[1] - a[1]);
  if (!ranked[0][1] || ranked[0][1] === ranked[1][1]) return;
  return ranked[0][0] === "en" || ranked[0][0] === "pt" ? ranked[0][0] : "other";
}

/** An explicit stored preference wins; otherwise the latest decisive user turn, so short follow-ups keep the language of the question they continue. */
export function answerLanguage(messages: ChatMessage[], session: ZarvisSession = {}): AnswerLanguage {
  if (session.language) return session.language === "en" || session.language === "pt" ? session.language : "other";
  for (const message of [...messages].reverse()) {
    if (message.role !== "user") continue;
    const language = questionLanguage(message.content);
    if (language) return language;
  }
  return "en";
}
