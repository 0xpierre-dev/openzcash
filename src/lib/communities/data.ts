/**
 * The curated dataset behind /communities: the global Zcash community groups,
 * their links, and their ZCG funding status.
 *
 * Curation rules (same discipline as the rest of the site):
 * - `zcg` numbers come from the audited ledger only (recipients/disbursements
 *   mirrors). A community with no ledger rows is `funded: false` — that
 *   absence is information, not an error.
 * - `forumTopics` are hand-picked forum topics (monthly reports, applications)
 *   whose live activity is fetched at request time; nothing here is scraped
 *   from X, which has no free API — X profiles are links only.
 * - Social accounts verified on 2026-09-20 against the communities' own
 *   forum reports, sites, proposals and link pages (one research and one
 *   adversarial verification pass per community); personal accounts of
 *   leads, suspended handles and name-only matches were left out. Activity
 *   signals: forum topics, YouTube RSS (channel ids) and Telegram channel
 *   previews. Instagram, TikTok, X and Facebook stay links only.
 * - Seeded from ZecHub's community-links page (the wiki's markdown source)
 *   plus the forum record, then verified per link.
 */

export type Region =
  | "North America"
  | "Latin America"
  | "Africa"
  | "Asia"
  | "Europe"
  | "Middle East"
  | "Global";

export interface CommunityLinks {
  x?: string;
  telegram?: string;
  discord?: string;
  youtube?: string;
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  linkedin?: string;
  whatsapp?: string;
  substack?: string;
  medium?: string;
  bluesky?: string;
  linktree?: string;
  /** YouTube channel id (UC...) — enables activity tracking via public RSS. */
  youtubeChannelId?: string;
  site?: string;
  /** Forum username of the lead / official account, without @. */
  forumUser?: string;
}

export interface CommunityZcg {
  /** True when the community has rows in the audited ZCG ledger. */
  funded: boolean;
  /** Exact recipient name in the ledger (differs from the public name). */
  recipient?: string;
  /** Budgeted USD total across its grants (ledger `usd`, NOT paid). */
  budgetedUsd?: number;
  /** Number of distinct grants in the ledger. */
  grants?: number;
  /** ISO date of the most recent paid disbursement. */
  lastPaid?: string;
  /** True when funded by the ZecHub DAO treasury (ambassador programs). */
  zechubDao?: boolean;
  /** Funding nuance: other channels (ZecHub DAO, Global Ambassador), etc. */
  note?: string;
}

export interface CommunityTopic {
  /** Discourse topic id on forum.zcashcommunity.com. */
  id: number;
  title: string;
  kind: "report" | "application" | "announcement" | "thread";
}

export interface Community {
  /** Stable slug (also the React key). */
  id: string;
  name: string;
  country: string;
  /** Emoji flag (or 🌐 for non-geographic groups). */
  flag: string;
  /** Official community logo (public path) — the mark the community itself
   * uses on X/the forum. Shown instead of the flag when present; person
   * avatars are never used here. */
  logo?: string;
  region: Region;
  language: string;
  links: CommunityLinks;
  zcg: CommunityZcg;
  /** Forum topics tracked for the live activity timeline. */
  forumTopics: CommunityTopic[];
  /** One-line description of who they are / what they do. */
  about: string;
  /** Year of the oldest verifiable public record (forum thread by the
   * community's own lead, ledger payment, or repo) — never guessed. */
  since?: number;
}

/** Date of the last per-link verification pass described above. */
export const COMMUNITIES_VERIFIED_ON = "2026-09-20";

export const COMMUNITIES: Community[] = [
  {
    id: "zechub",
    name: "ZecHub",
    country: "Global",
    flag: "🌐",
    logo: "/community-logos/zechub.png",
    region: "Global",
    language: "English",
    links: {"x": "https://x.com/zechub", "instagram": "https://www.instagram.com/itszechub/", "tiktok": "https://www.tiktok.com/@itszechub", "youtube": "https://www.youtube.com/@zechub", "youtubeChannelId": "UC3-KM00kjCUheRzO5cq3PAA", "discord": "https://discord.gg/zcash", "bluesky": "https://bsky.app/profile/zechub.bsky.social", "substack": "https://zechub.substack.com", "linktree": "https://linktr.ee/zechub", "site": "https://zechub.wiki", "forumUser": "squirrel"},
    zcg: {"funded": true, "recipient": "ZecHub", "budgetedUsd": 822392.43, "grants": 5, "lastPaid": "2026-08-03"},
    forumTopics: [{ id: 53686, title: "ZecHub 2026", kind: "report" }, { id: 56030, title: "ZecHub DAO — Proposal A149: Phase 1 Progress Report", kind: "report" }],
    about: "The community-owned education DAO: wiki, bounties, and the umbrella funding regional ambassadors from its own treasury.",
    since: 2022,
  },
  {
    id: "zcash-brazil",
    name: "Zcash Brazil",
    country: "Brazil",
    flag: "🇧🇷",
    logo: "/community-logos/zcash-brazil.png",
    region: "Latin America",
    language: "Portuguese",
    links: {"x": "https://x.com/zcashbrazil", "instagram": "https://www.instagram.com/zcashbrazil/", "youtube": "https://www.youtube.com/@zcashbrasil", "youtubeChannelId": "UCwZbX0U9Nlx1D_uXek8v2SQ", "telegram": "https://t.me/brzcash", "discord": "https://discord.gg/zcash", "facebook": "https://www.facebook.com/ZcashBrasil", "substack": "https://zcashbrazil.substack.com", "linktree": "https://linktr.ee/zcashbrasil", "site": "https://zcashbrasil.com.br", "forumUser": "Michae2xl"},
    zcg: {"funded": true, "recipient": "Zcash Brazil", "budgetedUsd": 655955.43, "grants": 7, "lastPaid": "2026-08-03"},
    forumTopics: [{ id: 53702, title: "Zcash Brazil | 2026", kind: "report" }, { id: 49458, title: "Zcash Brazil | 2025", kind: "report" }, { id: 54628, title: "ZECA: The Shielded Voice", kind: "announcement" }],
    about: "The largest regional community in the ZCG ledger: education, events, ZECA voice assistant, and monthly public reports since 2022.",
    since: 2022,
  },
  {
    id: "zk-av-club",
    name: "ZK AV Club",
    country: "Global",
    flag: "🌐",
    logo: "/community-logos/zk-av-club.png",
    region: "Global",
    language: "English",
    links: {"x": "https://x.com/ZkAv_Club", "youtube": "https://www.youtube.com/@ZkAv_Club", "youtubeChannelId": "UC8AiOGf0EptBSdd0Eg0DJDA", "bluesky": "https://bsky.app/profile/zkavclub.bsky.social", "site": "https://zkav.club", "forumUser": "ryan.taylor"},
    zcg: {"funded": true, "recipient": "ZK AV Club", "budgetedUsd": 288545, "grants": 2, "lastPaid": "2026-08-03"},
    forumTopics: [{ id: 53913, title: "Zcash Community Media Infrastructure & Support | Zk Av Club 2026", kind: "report" }, { id: 43733, title: "Zero-knowledge Audiovisual Club", kind: "thread" }],
    about: "Community media infrastructure: audiovisual production, streaming support and creator tooling for the whole ecosystem.",
    since: 2023,
  },
  {
    id: "zcash-en-espanol",
    name: "Zcash en Español",
    country: "Hispanic America & Spain",
    flag: "🇪🇸",
    logo: "/community-logos/zcash-en-espanol.png",
    region: "Latin America",
    language: "Spanish",
    links: {"x": "https://x.com/zcashesp1", "instagram": "https://www.instagram.com/zcashesp/", "youtube": "https://www.youtube.com/@zcashesp", "youtubeChannelId": "UCDO2Wu_ifYAmDFIyMgct2YQ", "telegram": "https://t.me/zcashesp", "bluesky": "https://bsky.app/profile/zcashesp.bsky.social", "substack": "https://zcashesp.substack.com", "medium": "https://zcashesp.medium.com", "linktree": "https://privtr.ee/@zcashesp", "site": "https://zcashesp.com", "forumUser": "yoditar"},
    zcg: {"funded": true, "recipient": "Zcash Español", "budgetedUsd": 195600, "grants": 4, "lastPaid": "2026-08-06"},
    forumTopics: [{ id: 56445, title: "Zcash for Venezuela!", kind: "thread" }, { id: 53815, title: "Zcash Global en Español 2026", kind: "report" }, { id: 55685, title: "Zcash en Español X account suspended", kind: "announcement" }, { id: 55530, title: "The Spanish-speaking Zcash community now has its own node!", kind: "announcement" }],
    about: "The Spanish-speaking hub, coordinated by yoditar: news, education, its own node, Venezuela outreach and a family of local clubs. Now on Bluesky after an X suspension.",
    since: 2020,
  },
  {
    id: "zcash-turkiye",
    name: "Zcash Türkiye",
    country: "Türkiye",
    flag: "🇹🇷",
    logo: "/community-logos/zcash-turkiye.png",
    region: "Europe",
    language: "Turkish",
    links: {"x": "https://x.com/ZcashTR", "instagram": "https://www.instagram.com/zcashturkish/", "tiktok": "https://www.tiktok.com/@zcashtr", "youtube": "https://www.youtube.com/@ZcashTurkiye", "youtubeChannelId": "UCIRGU0lwmO757xJFl14Jomg", "telegram": "https://t.me/ZcashTurkiye", "bluesky": "https://bsky.app/profile/zcashtr.bsky.social", "medium": "https://medium.com/@zcashturkish", "forumUser": "Batuhan"},
    zcg: {"funded": true, "recipient": "Batuhan", "budgetedUsd": 133070, "grants": 8, "lastPaid": "2026-08-19"},
    forumTopics: [{ id: 56274, title: "Zcash Türkiye 2026 Q3-4 - 2027 Q1-2-3-4", kind: "application" }, { id: 57087, title: "We Need Support with a Testnet ZEC Faucet", kind: "announcement" }, { id: 56903, title: "From Street Interviews to Education: Growing Zcash Awareness in Türkiye", kind: "report" }],
    about: "Street interviews to bootcamps: education and events across Türkiye, with the most recent ledger payment of any community.",
    since: 2024,
  },
  {
    id: "zcash-nigeria",
    name: "Zcash Nigeria",
    country: "Nigeria",
    flag: "🇳🇬",
    logo: "/community-logos/zcash-nigeria.png",
    region: "Africa",
    language: "English",
    links: {"x": "https://x.com/ZcashNigeria", "tiktok": "https://www.tiktok.com/@zcash.nigeria", "youtube": "https://www.youtube.com/@ZcashNigeria", "youtubeChannelId": "UCv1fk6fafDCEt7RrfPOTACQ", "telegram": "https://t.me/zcashnigeria1", "facebook": "https://www.facebook.com/people/Zcash-Nigeria/61577545730354", "substack": "https://zechubnigeria.substack.com", "medium": "https://medium.com/zcash-nigeria", "forumUser": "lisa001"},
    zcg: {"funded": true, "recipient": "Zcash Nigeria", "budgetedUsd": 103800, "grants": 5, "lastPaid": "2026-08-03"},
    forumTopics: [{ id: 53654, title: "Zcash Nigeria 2026", kind: "report" }, { id: 56291, title: "University of Ibadan Zcash Bootcamp", kind: "announcement" }],
    about: "Six consecutive ZCG grants of campus bootcamps and meetups across Nigeria.",
    since: 2025,
  },
  {
    id: "zcash-ghana",
    name: "Zcash Ghana",
    country: "Ghana",
    flag: "🇬🇭",
    region: "Africa",
    language: "English",
    links: {"x": "https://x.com/ZcashGH", "whatsapp": "https://chat.whatsapp.com/KMpce6DJCuUF2ytxgzwe4c", "forumUser": "ogasky"},
    zcg: {"funded": true, "recipient": "ZcashGH", "budgetedUsd": 25200, "grants": 2, "lastPaid": "2026-08-17"},
    forumTopics: [{ id: 57023, title: "Big things ahead for Zcash Ghana", kind: "announcement" }, { id: 56214, title: "Zcash Ghana (July 2026 - September 2026)", kind: "application" }, { id: 56792, title: "Zcash Ghana — Our First Year Journey (June 2025 – June 2026)", kind: "report" }],
    about: "Community education and meetups; two ZCG grants delivered.",
    since: 2025,
  },
  {
    id: "zcash-arabia",
    name: "Zcash Arabia",
    country: "MENA region",
    flag: "🕌",
    logo: "/community-logos/zcash-arabia.png",
    region: "Middle East",
    language: "Arabic",
    links: {"x": "https://x.com/ZcashArabia", "youtube": "https://www.youtube.com/@ZcashArabia", "youtubeChannelId": "UCzE6zuVqR7oHggD4GmFh50A", "telegram": "https://t.me/ZcashArabia", "site": "https://zcasharabia.xyz", "forumUser": "ZArabia"},
    zcg: {"funded": true, "recipient": "ZcashArabia", "budgetedUsd": 11500, "grants": 2, "lastPaid": "2026-05-27"},
    forumTopics: [{ id: 57170, title: "Grant Application - Zcash Arabia (August to December 2026)", kind: "application" }, { id: 56580, title: "Zcash Arabia (June to September 2026)", kind: "report" }],
    about: "Arabic-language content and community building across the MENA region.",
    since: 2025,
  },
  {
    id: "club-zcash-caracas",
    name: "Club Zcash Caracas",
    country: "Venezuela",
    flag: "🇻🇪",
    region: "Latin America",
    language: "Spanish",
    links: {"site": "https://free2z.cash/Yoditar/zpage/club-zcash-caracas-1o-meetup", "forumUser": "yoditar"},
    zcg: {"funded": true, "note": "Part of the Zcash en Espanol ecosystem, funded through its ZCG grant (no separate ledger recipient)."},
    forumTopics: [],
    about: "Caracas meetups under the Zcash en Espanol umbrella, where financial privacy is a daily necessity.",
    since: 2026,
  },
  {
    id: "club-zcash-barcelona",
    name: "Club Zcash Barcelona",
    country: "Spain",
    flag: "🇪🇸",
    region: "Europe",
    language: "Spanish/Catalan",
    links: {"site": "https://zcashesp.com/club-zcash-barcelona/", "forumUser": "gordonesTV"},
    zcg: {"funded": false},
    forumTopics: [{ id: 51247, title: "Club Zcash Barcelona, the journey begins!", kind: "thread" }],
    about: "Barcelona meetups under the Zcash en Español umbrella (managed by yoditar).",
    since: 2025,
  },
  {
    id: "coderaiz-mexico",
    name: "CodeRaiz México",
    country: "Mexico",
    flag: "🇲🇽",
    region: "Latin America",
    language: "Spanish",
    links: {"forumUser": "savinocalebresi"},
    zcg: {"funded": false},
    forumTopics: [{ id: 55506, title: "Zcash University Outreach Initiative – Mexico 2026 (CodeRaiz Proposal)", kind: "application" }],
    about: "Developer-focused education in Mexico, in the Español ecosystem.",
    since: 2026,
  },
  {
    id: "pesa-ya-siri-zcash-tanzania",
    name: "Pesa Ya Siri (Zcash Tanzania)",
    country: "Tanzania",
    flag: "🇹🇿",
    region: "Africa",
    language: "Swahili/English",
    links: {"forumUser": "clemencedouglas"},
    zcg: {"funded": false},
    forumTopics: [{ id: 56593, title: "What If Buying Zcash Was as Easy as Buying Airtime?", kind: "thread" }, { id: 55558, title: "Pesa Ya Siri: Making Zcash a Household Name in Tanzania", kind: "application" }],
    about: "Swahili-language education in Tanzania; proposals so far unfunded by the ZecHub DAO.",
    since: 2026,
  },
  {
    id: "ruzcash",
    name: "ruZcash",
    country: "Russia & CIS",
    flag: "🇷🇺",
    region: "Europe",
    language: "Russian",
    links: {"x": "https://x.com/ruZCASH", "youtube": "https://www.youtube.com/@prozcash", "youtubeChannelId": "UCjOSySJZsVAopa2nG8E-q3A", "discord": "https://discord.gg/UrarUa6BM8", "bluesky": "https://bsky.app/profile/ruzcash.bsky.social", "medium": "https://medium.com/@ruzcash", "site": "https://pro.zcash.ru", "forumUser": "artkor"},
    zcg: {"funded": false},
    forumTopics: [{ id: 38485, title: "Русскоязычный блог pro.zcash.ru", kind: "thread" }, { id: 55305, title: "Кошелёк Zodl больше недоступен в российских магазинах приложений", kind: "announcement" }, { id: 53449, title: "Artkor aka ruzcash for ZCG (December 2025) — candidatura ao comitê", kind: "thread" }],
    about: "Russian-language content, translations and community for the CIS region.",
    since: 2021,
  },
  {
    id: "boston-zcash",
    name: "Boston Zcash",
    country: "United States",
    flag: "🇺🇸",
    logo: "/community-logos/boston-zcash.png",
    region: "North America",
    language: "English",
    links: {"x": "https://x.com/BostonZcash", "linktree": "https://linktr.ee/BostonZcash", "site": "https://linktr.ee/BostonZcash", "forumUser": "BostonZcash"},
    zcg: {"funded": false, "note": "Self-declared unfunded; runs on its own."},
    forumTopics: [{ id: 56748, title: "Boston Zcash Meetup – July 28 – Ironwood Launch Event", kind: "announcement" }, { id: 50373, title: "Boston Zcash Meetup – March 06", kind: "announcement" }],
    about: "The Boston meetup, running since the Sapling era: protocol launch events and community gatherings.",
    since: 2018,
  },
  {
    id: "zcash-china",
    name: "Zcash China",
    country: "China",
    flag: "🇨🇳",
    region: "Asia",
    language: "Chinese",
    links: {"forumUser": "ZcashChina"},
    zcg: {"funded": false},
    forumTopics: [{ id: 33064, title: "On the Operation and Promotion of Zcash Community in China (2019, 16 posts)", kind: "thread" }, { id: 56438, title: "Zcash China 还有人吗? 想交流 (chamado por reativação)", kind: "thread" }],
    about: "Chinese-language content and translations for the Zcash ecosystem.",
    since: 2019,
  },
  {
    id: "zcash-club-queretaro",
    name: "Zcash Club Querétaro",
    country: "Mexico",
    flag: "🇲🇽",
    logo: "/community-logos/zcash-club-queretaro.png",
    region: "Latin America",
    language: "Spanish",
    links: {"x": "https://x.com/zcashqro", "site": "https://free2z.cash/palmar/zpage/club-zcash-queretaro-mexico-1er-aniversario", "forumUser": "palmar"},
    zcg: {"funded": false},
    forumTopics: [{ id: 55764, title: "Zcash Club Querétaro-Mexico: advancing financial privacy in Mexico", kind: "thread" }, { id: 56305, title: "Mandatory ID registration on mobile lines in Mexico: the role of Zcash in México", kind: "announcement" }],
    about: "Local Mexican club in the Español ecosystem, running Querétaro meetups.",
    since: 2026,
  },
  {
    id: "zcash-east-africa",
    name: "Zcash East Africa",
    country: "East Africa",
    flag: "🌍",
    logo: "/community-logos/zcash-east-africa.png",
    region: "Africa",
    language: "English/Swahili",
    links: {"x": "https://x.com/ZcashEastAfrica", "tiktok": "https://www.tiktok.com/@zcash.eastafrica", "telegram": "https://t.me/ZcashEastAfrica", "substack": "https://zcasheastafrica.substack.com", "forumUser": "Z.cash.EastAfrica"},
    zcg: {"funded": false, "note": "Not ZCG-funded; ZecHub DAO proposals have covered specific events only (e.g. ETHSafari), not the community itself."},
    forumTopics: [{ id: 57144, title: "Zcash East Africa @ ETHSafari 2026", kind: "announcement" }, { id: 56405, title: "Zcash East Africa (June-July 2026)", kind: "report" }, { id: 55860, title: "Zcash East Africa Official Launch & Community Onboarding Meetup", kind: "announcement" }],
    about: "Grassroots education in Uganda and Kenya, with event appearances backed by one-off ZecHub DAO proposals.",
    since: 2025,
  },
  {
    id: "zcash-france",
    name: "Zcash France",
    country: "France",
    flag: "🇫🇷",
    region: "Europe",
    language: "French",
    links: {"x": "https://x.com/ZcashFr"},
    zcg: {"funded": false},
    forumTopics: [{ id: 5544, title: "The French Corner / Le coin des Français", kind: "thread" }],
    about: "French-language community and content.",
    since: 2016,
  },
  {
    id: "zcash-global-germany",
    name: "Zcash Global Germany",
    country: "Germany",
    flag: "🇩🇪",
    region: "Europe",
    language: "German",
    links: {"x": "https://x.com/ZcashGermany", "forumUser": "HHIROSHIMA"},
    zcg: {"funded": false},
    forumTopics: [{ id: 50169, title: "Zcash Global Germany", kind: "announcement" }],
    about: "German-language community and content.",
    since: 2025,
  },
  {
    id: "zcash-india",
    name: "Zcash India",
    country: "India",
    flag: "🇮🇳",
    region: "Asia",
    language: "Hindi/English",
    links: {"x": "https://x.com/ZcashIND", "instagram": "https://www.instagram.com/zcashind/", "youtube": "https://www.youtube.com/channel/UC0l_AqdXr_i8iD5JOoL2UKQ", "youtubeChannelId": "UC0l_AqdXr_i8iD5JOoL2UKQ", "telegram": "https://t.me/ZcashIN", "site": "https://zcashind.com", "forumUser": "jatinsahijwani"},
    zcg: {"funded": false, "zechubDao": true, "note": "Ambassador program funded by the ZecHub DAO treasury, not the ZCG ledger."},
    forumTopics: [{ id: 54762, title: "Zcash India 2026", kind: "announcement" }, { id: 56847, title: "Open Light Nodes: Independent Zcash Light Client Infrastructure for Asia", kind: "application" }, { id: 54544, title: "Zcash India 2026 Grant Application", kind: "application" }],
    about: "Education and meetups in India, funded as a ZecHub DAO ambassador program.",
    since: 2026,
  },
  {
    id: "zcash-indonesia",
    name: "Zcash Indonesia",
    country: "Indonesia",
    flag: "🇮🇩",
    region: "Asia",
    language: "Bahasa Indonesia",
    links: {"x": "https://x.com/ZcashIdn", "substack": "https://zcashidn.substack.com", "medium": "https://medium.com/@ZcashIdn"},
    zcg: {"funded": false},
    forumTopics: [{ id: 38678, title: "Zcash Untuk Nusantara (post único, 2021)", kind: "thread" }],
    about: "Bahasa Indonesia content and community, in the QRIS offramp corridor.",
    since: 2021,
  },
  {
    id: "zcash-japan",
    name: "Zcash Japan",
    country: "Japan",
    flag: "🇯🇵",
    region: "Asia",
    language: "Japanese",
    links: {"youtube": "https://www.youtube.com/@ZcashJapan", "youtubeChannelId": "UCnCl94A8Mde6Vgo0uSQXKjQ", "site": "https://zcashjapan.com", "forumUser": "ryu963"},
    zcg: {"funded": false},
    forumTopics: [{ id: 54827, title: "Strategic Lobbying and Community Building for the Proliferation and Understanding of Zcash in Japan", kind: "application" }],
    about: "Japanese-language community and translations.",
    since: 2026,
  },
  {
    id: "zcash-korea",
    name: "Zcash Korea",
    country: "South Korea",
    flag: "🇰🇷",
    region: "Asia",
    language: "Korean",
    links: {"x": "https://x.com/zcashkorea", "telegram": "https://t.me/KoreaZcashCommunity", "forumUser": "AidenZ"},
    zcg: {"funded": false, "zechubDao": true, "note": "Ambassador program funded by the ZecHub DAO treasury, not the ZCG ledger."},
    forumTopics: [{ id: 56458, title: "Zechub DAO - 2026 Zcash Korea Ambassador Proposal (Approved)", kind: "application" }, { id: 50498, title: "Zechub DAO - Zcash Korea Ambassador Proposal (Approved) — edição 2025", kind: "application" }],
    about: "Korean community, funded as a ZecHub DAO Global Ambassador program.",
    since: 2025,
  },
  {
    id: "elzz-global-ambassador",
    name: "Elzz — Global Ambassador",
    country: "Global",
    flag: "🌐",
    region: "Global",
    language: "English",
    links: {"x": "https://x.com/CQ_Elzz", "telegram": "https://t.me/CQ_Elzz", "forumUser": "elzz-ux"},
    zcg: {"funded": false, "zechubDao": true, "note": "Global Ambassador program funded by the ZecHub DAO treasury (three consecutive terms through Dec 2026)."},
    forumTopics: [{ id: 56859, title: "Global Ambassador Elzz July 2026 Report", kind: "report" }],
    about: "ZecHub DAO Global Ambassador: educational content, X Spaces and ecosystem awareness, with monthly public reports.",
    since: 2025,
  },
  {
    id: "zcash-ukraine",
    name: "Zcash Ukraine",
    country: "Ukraine",
    flag: "🇺🇦",
    logo: "/community-logos/zcash-ukraine.png",
    region: "Europe",
    language: "Ukrainian",
    links: {"x": "https://x.com/Zcash_ua", "instagram": "https://www.instagram.com/zcash_ua/", "telegram": "https://t.me/zcash_ua", "linkedin": "https://www.linkedin.com/company/zcash-ukraine", "substack": "https://zcashukraine.substack.com", "forumUser": "beyond"},
    zcg: {"funded": false, "zechubDao": true, "note": "Ambassador program funded by the ZecHub DAO treasury, not the ZCG ledger."},
    forumTopics: [{ id: 54059, title: "Zcash Ukraine – Monthly Report (December 1–31, 2025) — último da série mensal iniciada em jun/2025", kind: "report" }, { id: 52330, title: "Zcash Ukraine Regional Community Initiative", kind: "application" }],
    about: "Ukrainian community and education under wartime conditions.",
    since: 2025,
  },
  {
    id: "zcashsa-zcash-south-africa",
    name: "ZcashSA (Zcash South Africa)",
    country: "South Africa",
    flag: "🇿🇦",
    logo: "/community-logos/zcashsa-zcash-south-africa.png",
    region: "Africa",
    language: "English",
    links: {"x": "https://x.com/Zcash_SA", "telegram": "https://t.me/zcashSA", "medium": "https://medium.com/@zcashsouthafrica", "linktree": "https://linktr.ee/zcash_sa", "forumUser": "Inspire_s"},
    zcg: {"funded": false},
    forumTopics: [{ id: 57133, title: "Support ZcashSA", kind: "announcement" }, { id: 56576, title: "Zcash first community event in Pretoria, SA", kind: "announcement" }, { id: 55706, title: "Privacy has landed in South Africa! Join in", kind: "announcement" }],
    about: "South African community education and meetups.",
    since: 2026,
  },
  {
    id: "zcast",
    name: "Zcast",
    country: "Global",
    flag: "🎙️",
    logo: "/community-logos/zcast.png",
    region: "Global",
    language: "Spanish",
    links: {"x": "https://x.com/ZcastEsp", "youtube": "https://www.youtube.com/@ZcastEsp", "youtubeChannelId": "UCbC4u45hFuTkdM_QarR7yfw", "bluesky": "https://bsky.app/profile/zcastesp.bsky.social", "site": "https://zcashesp.com/zcast"},
    zcg: {"funded": false},
    forumTopics: [{ id: 54291, title: "Zcast, the Zcash podcast in Spanish - A new phase", kind: "announcement" }, { id: 44447, title: "Zcast, el podcast de Zcash en Español", kind: "thread" }],
    about: "The Spanish-language Zcash podcast, in the Español ecosystem.",
    since: 2023,
  },
];
