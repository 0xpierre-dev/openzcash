import { directIntent, type DirectIntent } from "./direct-intent";
import { isHistoricalQuestion, isMiningQuestion } from "./research-scope";
import type { AnswerLanguage, DirectLanguage } from "./language";
import type { ChatMessage } from "./types";

/** The fixed taxonomy a question is reduced to for the request log: one label from this list, never a word of the question. Order is the tie-break: the more specific subject wins when two score the same ("coinholder grants" is the coinholder program, "treasury calculator" is the calculator). */
export const TOPICS = ["coinholder-grants", "calculator-scenario", "price", "treasuries", "grants-ledger", "governance", "wallets", "privacy-keys", "mining-network", "zips-protocol", "communities", "news-forum", "history-people", "site-help", "other"] as const;
export type Topic = typeof TOPICS[number];
type Terms = Record<DirectLanguage, string>;
const LANGS = ["en", "pt", "es"] as const;
/** Space-separated stems per language; a trailing `*` matches any word ending and a `_` joins the words of a phrase. English holds the names and acronyms the three languages share. */
const TERMS: Record<Exclude<Topic, "other">, Terms> = {
  "coinholder-grants": { en: "coinholder* coin_holder* fpf financial_privacy_foundation coinholder_vote* zcash_fund*", pt: "detentor* votacao_dos_coinholders", es: "tenedor* votacion_de_los_coinholders" },
  "calculator-scenario": { en: "calculator* scenario* coverage runway mine_then_buy simulat* what_if 20x 10x 5x 2x 100x ownership how_many_years years_of", pt: "calculadora* cenario* cobertura simul* e_se quantos_anos anos_de vezes_maior", es: "calculadora* escenario* cobertura simul* y_si cuantos_anos anos_de veces_mas" },
  price: { en: "price* quote* worth market_cap marketcap ath all_time_high usd dollar* trading buy* sell* exchange_rate invest*", pt: "preco* cotacao* vale valendo custa custando dolar* comprar vender valor_de_mercado investimento*", es: "precio* cotiza* cotizacion* vale valiendo cuesta costando dolar* comprar vender capitalizacion inversion*" },
  treasuries: { en: "treasur* lockbox balance* holdings hold holds reserve* fund_balance", pt: "tesour* saldo* reserva* caixa guarda possui detem", es: "tesorer* saldo* reserva* fondos guarda posee tiene_en" },
  "grants-ledger": { en: "grant* grantee* paid pay payout* payment* disburse* milestone* proposal* applica* applicant* recipient* under_review budget* zcg_pay* project_history", pt: "pagou pagaram pagamento* desembols* marco* proposta* candidatura* beneficiario* orcamento* em_revisao subsidio*", es: "pago pagado pagos pagaron desembols* hito* propuesta* solicitud* beneficiario* presupuesto* en_revision subvencion* subsidio*" },
  governance: { en: "committee* election* elected member* meeting* minutes vote* voting poll* governance dev_fund development_fund ecc zfnd foundation bootstrap approved rejected withdrawn decision* verdict* term monthly_report ballot*", pt: "comite* eleicao* eleicoes eleito* membro* reuniao* reunioes ata* vota* votacao* enquete* governanca fundo_de_desenvolvimento fundacao aprovad* rejeitad* retirad* decisao* decisoes relatorio_mensal mandato", es: "comite* eleccion* elecciones elegido* miembro* reunion* reuniones acta* vota* votacion* encuesta* gobernanza fondo_de_desarrollo fundacion aprobad* rechazad* retirad* decision* decisiones informe_mensual mandato" },
  wallets: { en: "wallet* zashi zingo ywallet zodl zkool keystone trezor ledger_nano ledger_wallet ledger_device nighthawk cake_wallet edge_wallet unstoppable brave_wallet metamask vizor zipher zstash zapp gem_wallet app apps ios android desktop mobile hardware seed_phrase recovery_phrase restore* backup* sync* install* send sending receive receiving memo support* maintained maintenance pending stuck unconfirmed", pt: "carteira* celular aplicativo* restaura* sincroniz* enviar receber frase_de_recuperacao suporta* funciona_no mantid* pendente travad* presa", es: "billetera* cartera* celular aplicacion* restaura* sincroniz* enviar recibir frase_semilla frase_de_recuperacion soporta* funciona_en mantenimiento recomiend* pendiente atascad*" },
  "privacy-keys": { en: "privacy private shielded shield* transparent anonym* trace* traceab* viewing_key* ivk fvk ovk ufvk unified_address* address* zero_knowledge zk zk_snark* snark* halo sender recipient t_address z_address taddr zaddr unshield* deshield* hidden hide* reveal* key keys", pt: "privacidade privad* blindad* transparente* anonim* rastre* chave* endereco* remetente destinatario oculta* revela* conhecimento_zero", es: "privacidad privad* blindad* transparente* anonim* rastre* clave* direccion* remitente destinatario oculta* revela* conocimiento_cero" },
  "mining-network": { en: "hashrate* hash_rate* solrate* mining miner* difficulty pool* block_height height chain_tip tip node* lightwalletd zebra zaino zcashd value_pool* shielded_pool* circulating network_activity monthly_activity transactions_per tps", pt: "mineracao minerador* mineiro* dificuldade altura_do_bloco altura pool_blindada no_completo circulante circulacao atividade_mensal", es: "mineria minero* dificultad altura_del_bloque altura pool_blindad* nodo* circulante circulacion actividad_mensual" },
  "zips-protocol": { en: "zip zips nu5 nu6 nu7 nu8 network_upgrade* protocol halving* subsidy issuance supply sapling orchard sprout consensus activation* activated block_time block_spacing fee fees arborist* specification", pt: "atualizacao_de_rede protocolo subsidio emissao oferta consenso ativacao ativad* tempo_de_bloco taxa* especificacao", es: "actualizacion_de_red protocolo subsidio emision oferta consenso activacion activad* tiempo_de_bloque tarifa* comision* especificacion" },
  communities: { en: "communit* ambassador* meetup* telegram discord zechub dao local_group* country countries region* event* zcon conference* brazil brasil argentina mexico spain portugal latam africa nigeria", pt: "comunidade* embaixador* grupo_local* pais regiao* evento* encontro* conferencia*", es: "comunidad* embajador* grupo_local* pais region* evento* encuentro* conferencia*" },
  "news-forum": { en: "news announce* announcement* blog roadmap release* launch* partnership* forum thread* topic what_happened whats_new twitter tweet* post posts discussed discussion*", pt: "noticia* anuncio* anunci* lancamento* parceria* forum topico* o_que_aconteceu novidade* discuss* publicacao*", es: "noticia* anuncio* anunci* lanzamiento* alianza* asociacion* foro hilo* que_paso novedad* discut* discusion* publicacion*" },
  "history-people": { en: "zooko wilcox daira hopwood finney chaum snowden satoshi nakamoto sean_bowe peter_todd andrew_miller matthew_green ian_miers ben_sasson madars_virza eran_tromer christina_garman alessandro_chiesa josh_swihart str4d jack_grigg nuttycombe founder* founded created_zcash history historical ceremony trusted_setup powers_of_tau origin* genesis block_zero ten_years launched_in 2016 cypherpunk* who_created who_founded who_invented", pt: "fundador* fundad* historia cerimonia origem genese dez_anos quem_criou quem_fundou quem_inventou lancad*", es: "fundador* fundad* historia ceremonia origen genesis diez_anos quien_creo quien_fundo quien_invento lanzad*" },
  "site-help": { en: "openzcash zarvis this_site this_page dashboard* methodology data_source* source_of_the_data where_does_the_data how_fresh updated last_updated export csv download api verify copy_link bug wrong_number feedback menu navigate* my_wallet my_balance my_zec can_you_see can_you what_can_you who_are_you what_are_you language* you_do you_know", pt: "este_site esta_pagina metodologia fonte* de_onde_vem atualizad* exportar baixar verificar erro* minha_carteira meu_saldo meus_zec voce_consegue_ver voce_pode o_que_voce quem_e_voce idioma* voce_faz voce_sabe", es: "este_sitio esta_pagina metodologia fuente* de_donde_vienen actualizad* exportar descargar verificar error* mi_billetera mi_cartera mi_saldo mis_zec puedes_ver puedes que_puedes quien_eres idioma* haces sabes" },
};
const pattern = (terms: string) => new RegExp(`\\b(?:${terms.split(" ").map((term) => term.replaceAll("_", " ").replace(/\*$/, "\\w*")).join("|")})\\b`, "g");
const MATCHERS = (Object.entries(TERMS) as Array<[Exclude<Topic, "other">, Terms]>).map(([topic, terms]) => [topic, { en: pattern(terms.en), pt: pattern(terms.pt), es: pattern(terms.es) }] as const);
const ZIP_NUMBER = /\bzips?\s*[-#]?\s*\d{1,6}\b|\bnu\s?[5-9]\b/;
const FORUM_LINK = /forum\.zcashcommunity\.com|\b(?:forum|foro)\b.*\b(?:thread|topic|topico|hilo|t)\b|\/t\/[a-z0-9-]+\/\d+/;
/** Accents and case only: the dots of a link and the digits of a ZIP number stay in place. */
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** The deterministic routes already name their subject; the reviewed FAQ ids map one by one. */
const INTENT_TOPIC: Record<DirectIntent["type"], Topic | null> = { price: "price", mining: "mining-network", arborist: "zips-protocol", ledger: null, treasury: "treasuries", faq: null, zip: "zips-protocol", latest_zip: "zips-protocol", courtesy: "other", preference: "other" };
const FAQ_TOPIC: Record<string, Topic> = { zcash: "privacy-keys", privacy: "privacy-keys", viewing: "privacy-keys", incoming: "privacy-keys", full: "privacy-keys", outgoing: "privacy-keys", key_spend: "privacy-keys", key_sender: "privacy-keys", unified: "privacy-keys", supply: "zips-protocol", five_percent: "zips-protocol", halving: "zips-protocol", funding: "governance", openzcash: "site-help", methodology: "site-help", zcg: "governance", lockbox: "treasuries", calculator: "calculator-scenario", hashrate: "mining-network", mining_pool: "mining-network", pool_ownership: "mining-network", mining_sources: "mining-network", mining_comparison: "mining-network", wallets: "wallets" };
const intentTopic = (intent: DirectIntent | undefined): Topic | undefined => {
  if (!intent) return;
  if (intent.type === "ledger") return intent.filters.scope === "coinholder_grants" ? "coinholder-grants" : "grants-ledger";
  if (intent.type === "faq") return FAQ_TOPIC[intent.id];
  return INTENT_TOPIC[intent.type] ?? undefined;
};
/** Distinct matched words per topic, a word counted once even when two languages share the stem ("blindado" is Portuguese and Spanish); a phrase ("shielded pools", "mine then buy") counts for its two words, and the words of the answer language count double so "pago" reads as Spanish in a Spanish conversation and as Portuguese otherwise. */
function scoreTerms(q: string, language?: AnswerLanguage): Topic | undefined {
  const weight = (lang: DirectLanguage) => lang === language ? 2 : 1;
  const scored = MATCHERS.map(([topic, matchers]) => {
    const hits = LANGS.flatMap((lang) => (q.match(matchers[lang]) ?? []).map((word) => [word, weight(lang)] as const));
    return [topic, [...new Set(hits.map(([word]) => word))].reduce((sum, word) => sum + Math.max(...hits.filter(([w]) => w === word).map(([, w]) => w)) * (word.includes(" ") ? 2 : 1), 0)] as const;
  });
  const best = Math.max(...scored.map(([, score]) => score));
  return best > 0 ? scored.find(([, score]) => score === best)?.[0] : undefined;
}
function topicWithIntent(intent: DirectIntent | undefined, question: string, language?: AnswerLanguage): Topic {
  const q = normalize(question).trim();
  if (!q) return "other";
  const direct = intentTopic(intent);
  if (direct) return direct;
  if (ZIP_NUMBER.test(q)) return "zips-protocol";
  if (FORUM_LINK.test(q)) return "news-forum";
  if (isHistoricalQuestion(q)) return "history-people";
  return scoreTerms(q, language) ?? (isMiningQuestion(q) ? "mining-network" : "other");
}
/** The coarse subject of one question: the deterministic routes first (they already know price, treasury, ledger, ZIP and FAQ questions), then the strong markers (a ZIP number, a forum link, a historical question), then the term lists. Returns a label only, never the question. */
export function topicOf(question: string, language?: AnswerLanguage): Topic {
  return topicWithIntent(directIntent([{ role: "user", content: question }]), question, language);
}
/** The topic of the latest user turn in its conversation: a direct follow-up ("and the lockbox", "and in 2024") inherits the subject it continues, as the direct routes resolve it. */
export function conversationTopic(messages: ChatMessage[], language?: AnswerLanguage): Topic {
  const latest = messages.at(-1);
  if (!latest || latest.role !== "user") return "other";
  return topicWithIntent(directIntent(messages), latest.content, language);
}
