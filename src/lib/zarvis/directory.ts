import {
  HARDWARE,
  SOFTWARE,
  WALLET_CATALOG_REVISED_ON,
  type Wallet,
} from "@/app/wallets/catalog-data";
import {
  COMMUNITIES,
  COMMUNITIES_VERIFIED_ON,
  type Community,
} from "@/lib/communities/data";
import { terms } from "./sources";

const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const PLATFORMS: Array<[RegExp, string]> = [
  [/\b(?:ios|iphone|ipad|apple)\b/, "iOS"],
  [/\bandroid\b/, "Android"],
  [/\b(?:desktop|linux|windows|macos|mac|pc|computador)\b/, "Desktop"],
  [/\b(?:browser|extension|extensao|navegador)\b/, "Browser extension"],
  [/\bweb\b/, "Web"],
  [/\bhardware\b/, "Hardware"],
];
const NOISE = new Set(
  "wallet wallets carteira carteiras support supports supported suporta suportam which what quais qual list lista best melhor recommended recomendada use usar shielded blindada blindadas transparent transparente partial parcial full completa hardware software ios android desktop browser extension web app apps mobile open source audit audited audits safe secure cold privacy private available version".split(
    " ",
  ),
);
const shieldedLevel = (q: string) =>
  /\b(?:transparent\w*|t-?addr\w*)\b/.test(q) && !/\bshielded|blindad/.test(q)
    ? "transparent"
    : /\b(?:partial\w*|parcia\w*)\b/.test(q)
      ? "partial"
      : /\b(?:shielded|blindad\w*|orchard|sapling|z-?addr\w*|privat\w*)\b/.test(
            q,
          )
        ? "full"
        : null;
const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A former name in the note ("Formerly Zashi") is still how people ask for the wallet. */
const formerName = (w: Wallet) =>
  w.note.match(/\bformerly ([\p{L}\p{N}!]+)/iu)?.[1] ?? "";
/** A name word must start a word of the name, maker or former name, so "so" never selects "Brave Software" and "safe" never selects ChainSafe's wallet. */
const namesWallet = (t: string, w: Wallet) =>
  t.length >= 3 &&
  new RegExp(`\\b${escape(t)}`).test(
    normalize(`${w.name} ${w.maker} ${formerName(w)}`),
  );

/** The wallet catalog with the question's platform, shielded level and name filters applied; the full inventory stays listed, and comes before the rows so the serialized budget cuts rows first. */
export function walletsContext(query: string) {
  const q = normalize(query);
  const all = [
    ...SOFTWARE.map((w) => ({ w, kind: "software" })),
    ...HARDWARE.map((w) => ({ w, kind: "hardware" })),
  ];
  const platform = PLATFORMS.find(([pattern]) => pattern.test(q))?.[1] ?? null;
  const shielded = shieldedLevel(q);
  const kind = /\bhardware\b/.test(q)
    ? "hardware"
    : /\bsoftware|app\b/.test(q)
      ? "software"
      : null;
  const words = terms(q).filter((t) => !NOISE.has(t));
  const named = all.filter(({ w }) => words.some((t) => namesWallet(t, w)));
  const pool = named.length ? named : all;
  const matched = pool.filter(
    ({ w, kind: k }) =>
      (!platform || w.platforms.includes(platform)) &&
      (!shielded || w.shielded === shielded) &&
      (!kind || k === kind),
  );
  const row = ({ w }: { w: Wallet }) => ({
    name: w.name,
    maker: w.maker,
    platforms: w.platforms.join(", "),
    shielded: w.shielded,
    ...(w.tag ? { status: w.tag } : {}),
    note: w.note,
    site: w.url,
    ...(w.source ? { sourceCode: w.source } : {}),
    ...(w.audit ? { auditReport: w.audit } : {}),
  });
  return {
    catalogRevisedOn: WALLET_CATALOG_REVISED_ON,
    totalWallets: all.length,
    fullShielded: all.filter(({ w }) => w.shielded === "full").length,
    hardwareWallets: HARDWARE.length,
    allWallets: all.map(({ w }) => `${w.name}:${w.shielded}`).join(", "),
    note: "Curated catalog; catalogRevisedOn is the date of the last edit to its entries, not a review of every wallet. full = shielded send and receive (Orchard/Sapling); partial = limited; transparent = t-addresses only. Absent from allWallets = not catalogued, not nonexistent. Not an audit or endorsement; confirm platforms and releases on each wallet's site.",
    filter: { platform, shielded, kind, names: named.map(({ w }) => w.name) },
    matched: matched.length,
    wallets: matched.map(row),
  };
}

const ALIASES: Record<string, string[]> = {
  brasil: ["brazil"],
  brazilian: ["brazil"],
  brasileira: ["brazil"],
  espanol: ["espanol", "spanish", "hispanic"],
  espanhol: ["spanish"],
  hispano: ["hispanic"],
  latam: ["latin"],
  latina: ["latin"],
  turkey: ["turkiye"],
  turquia: ["turkiye"],
  mexico: ["mexico"],
  venezuela: ["venezuela"],
  africa: ["africa"],
  asia: ["asia"],
  europe: ["europe"],
  europa: ["europe"],
  eua: ["united states"],
  usa: ["united states"],
  america: ["america"],
  russia: ["russia"],
  russian: ["russia"],
  korea: ["korea"],
  coreia: ["korea"],
  japao: ["japan"],
  india: ["india"],
  indonesia: ["indonesia"],
  nigeria: ["nigeria"],
  ghana: ["ghana"],
  tanzania: ["tanzania"],
  ukraine: ["ukraine"],
  ucrania: ["ukraine"],
  china: ["china"],
  germany: ["germany"],
  alemanha: ["germany"],
  france: ["france"],
  franca: ["france"],
  spain: ["spain"],
  espanha: ["spain"],
  arabia: ["arabia", "mena"],
  arabic: ["arabia"],
  portugues: ["portuguese"],
  ambassador: ["ambassador"],
  embaixador: ["ambassador"],
  global: ["global"],
};
const COMMUNITY_NOISE = new Set(
  "community communities comunidade comunidades group groups grupo grupos zcash there any which what quais qual by are exist existem funded funds fund financiada financiadas financiado financiados zcg grant grants receive recebem list lista".split(
    " ",
  ),
);
const forum = (id: number) => `https://forum.zcashcommunity.com/t/${id}`;
const FORUM_TOPICS = 2;
/** Short rows, so several fit the serialized budget behind the inventory: ledger fields only when funded, and the page carries every social link and older forum topic. */
const row = (c: Community) => ({
  name: c.name,
  country: c.country,
  region: c.region,
  language: c.language,
  ...(c.since ? { since: c.since } : {}),
  about: c.about,
  zcgFunded: c.zcg.funded,
  ...(c.zcg.funded
    ? {
        zcgLedgerRecipient: c.zcg.recipient ?? null,
        zcgBudgetedUsd: c.zcg.budgetedUsd ?? null,
        zcgGrants: c.zcg.grants ?? null,
        lastPaidDate: c.zcg.lastPaid ?? null,
      }
    : {}),
  ...(c.zcg.zechubDao ? { zechubDaoFunded: true } : {}),
  ...(c.zcg.note ? { fundingNote: c.zcg.note } : {}),
  site: c.links.site ?? null,
  forumUser: c.links.forumUser ?? null,
  forumTopics: c.forumTopics
    .slice(0, FORUM_TOPICS)
    .map((t) => `${t.kind}: ${t.title} ${forum(t.id)}`),
});
/** The global-communities directory, filtered by name, country, region or language words; every name stays listed by region, ahead of the rows, so the serialized budget cuts rows first. */
export function communitiesContext(query: string) {
  const words = [
    ...new Set(
      terms(normalize(query))
        .filter((t) => !COMMUNITY_NOISE.has(t))
        .flatMap((t) => [t, ...(ALIASES[t] ?? [])]),
    ),
  ];
  const score = (c: Community) => {
    const hay = normalize(
      `${c.name} ${c.country} ${c.region} ${c.language} ${c.about} ${c.zcg.recipient ?? ""}`,
    );
    return words.reduce((n, t) => n + Number(hay.includes(t)), 0);
  };
  const funded = /\b(?:funded|financiad\w*|grants?|zcg)\b/.test(
    normalize(query),
  );
  const ranked = COMMUNITIES.map((c) => ({ c, s: score(c) }))
    .filter(
      ({ c, s }) =>
        (words.length ? s > 0 : true) &&
        (!funded || words.length || c.zcg.funded),
    )
    .sort((a, b) => b.s - a.s);
  const byRegion: Record<string, string> = {};
  for (const c of COMMUNITIES)
    byRegion[c.region] = [byRegion[c.region], c.name]
      .filter(Boolean)
      .join(", ");
  return {
    verifiedOn: COMMUNITIES_VERIFIED_ON,
    totalCommunities: COMMUNITIES.length,
    zcgFundedCommunities: COMMUNITIES.filter((c) => c.zcg.funded).length,
    allCommunitiesByRegion: byRegion,
    note: "OpenZcash's curated community directory, links verified on verifiedOn. zcgBudgetedUsd is budgeted USD in the audited ZCG ledger, not paid; zcgFunded false means no ledger rows, not that the group is unfunded elsewhere (see fundingNote). Social links, live forum and YouTube activity are on https://openzcash.org/communities, not in this excerpt. A group absent from allCommunitiesByRegion is not in the directory.",
    filter: { words, fundedOnly: funded && !words.length },
    matched: ranked.length,
    communities: ranked.map(({ c }) => row(c)),
  };
}
