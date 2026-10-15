import type { LegalItem, LegalSource } from "./types";

// Reviewed source records: docs/audits/2026-10-05-zcash-legal-sources.json
export const LEGAL_ITEMS: LegalItem[] = [
  {
    "id": "pgpz-2026-07-24-statements-for-the-record",
    "title": "Statements for the Record—July 17 CLARITY Act and July 21 FinCEN Oversight Hearings",
    "summary": "PGPZ reports submitting statements following House Financial Services Committee hearings on the CLARITY Act and FinCEN oversight.",
    "url": "https://pgpz.org/updates/2026-07-24-statements-for-the-record",
    "sourceId": "pgp",
    "publishedAt": "2026-07-24",
    "regions": [
      "north-america"
    ],
    "jurisdictions": [
      "United States"
    ],
    "topics": [
      "Regulation",
      "Policy"
    ],
    "kind": "Official update",
    "status": "Analysis",
    "statusDetail": "Advocacy submissions, not an enacted rule or agency decision.",
    "reviewedAt": "2026-10-05"
  },
  {
    "id": "pgpz-2026-09-28-weekly-policy-memo",
    "title": "Weekly Policy Memo: Week of September 28, 2026",
    "summary": "PGPZ reviews US crypto custody proposals, tax legislation and agency guidance, with state-level developments in Illinois, New York and Wyoming.",
    "url": "https://pgpz.org/updates/2026-09-28-weekly-policy-memo",
    "sourceId": "pgp",
    "publishedAt": "2026-09-28",
    "regions": [
      "north-america"
    ],
    "jurisdictions": [
      "United States",
      "Illinois",
      "New York",
      "Wyoming"
    ],
    "topics": [
      "Regulation",
      "Policy"
    ],
    "kind": "Policy memo",
    "status": "Analysis",
    "statusDetail": "Publisher analysis. Full memo available in the public PGPZ archive.",
    "reviewedAt": "2026-10-05"
  },
  {
    "id": "br-bcb-588-self-custody-reporting",
    "title": "Brazil adds reporting for larger self-custody transfers",
    "summary": "BCB-regulated institutions must report virtual-asset transfers of at least US$10,000 equivalent to or from self-custodied wallets to Coaf.",
    "url": "https://www.bcb.gov.br/detalhenoticia/21267/nota",
    "sourceId": "bcb",
    "publishedAt": "2026-09-23",
    "regions": [
      "latam"
    ],
    "jurisdictions": [
      "Brazil"
    ],
    "topics": [
      "Privacy",
      "Regulation"
    ],
    "kind": "Regulation",
    "status": "In force",
    "reviewedAt": "2026-10-05",
    "effectiveAt": "2026-10-01",
    "statusDetail": "Applies to BCB-authorized institutions. This is a reporting rule, not a ban on self-custody."
  },
  {
    "id": "br-decripto-july-2026",
    "title": "DeCripto reporting covers transactions from July 2026",
    "summary": "Receita Federal confirms that transactions from July 2026 move to DeCripto reporting, including covered overseas providers serving Brazil. The reporting duty is separate from whether tax is owed.",
    "url": "https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/stablecoins-ja-respondem-por-cerca-de-80-do-volume-declarado-de-criptoativos-no-brasil",
    "sourceId": "rfb",
    "publishedAt": "2026-07-23",
    "regions": [
      "latam"
    ],
    "jurisdictions": [
      "Brazil"
    ],
    "topics": [
      "Regulation",
      "Policy"
    ],
    "kind": "Regulation",
    "status": "In force",
    "reviewedAt": "2026-10-05",
    "effectiveAt": "2026-07-01",
    "statusDetail": "July is the transaction period covered, not a filing deadline for every holder."
  },
  {
    "id": "ar-cnv-1058-psav",
    "title": "Argentina regulates crypto-service providers",
    "summary": "CNV’s PSAV framework sets registration, custody, cybersecurity and disclosure requirements for covered crypto-service providers. Most requirements for providers already registered became enforceable on 31 December 2025.",
    "url": "https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-1058-2025-410635/texto",
    "sourceId": "cnv",
    "publishedAt": "2025-03-14",
    "regions": [
      "latam"
    ],
    "jurisdictions": [
      "Argentina"
    ],
    "topics": [
      "Regulation",
      "Policy"
    ],
    "kind": "Regulation",
    "status": "In force",
    "reviewedAt": "2026-10-05",
    "effectiveAt": "2025-12-31",
    "statusDetail": "The December date concerns existing providers; transitional deadlines vary by requirement."
  },
  {
    "id": "eu-amlr-article-79",
    "title": "EU anonymous-account restriction applies from July 2027",
    "summary": "From 10 July 2027, Article 79 restricts covered institutions’ anonymous or transaction-obfuscating accounts, including through anonymity-enhancing coins. The regulation does not name Zcash.",
    "url": "https://eur-lex.europa.eu/eli/reg/2024/1624/oj/eng",
    "sourceId": "eurlex",
    "publishedAt": "2024-06-19",
    "regions": [
      "europe"
    ],
    "jurisdictions": [
      "European Union"
    ],
    "topics": [
      "Privacy",
      "Regulation"
    ],
    "kind": "Regulation",
    "status": "Adopted",
    "reviewedAt": "2026-10-05",
    "effectiveAt": "2027-07-10",
    "statusDetail": "Article 79 applies to covered financial institutions and crypto-service providers, not a general ban on holding Zcash."
  },
  {
    "id": "us-sec-crypto-custody-proposal-2026",
    "title": "SEC proposes a crypto-custody framework",
    "summary": "The SEC’s proposal would change how registered advisers and regulated funds hold crypto assets, including self-custody in specified circumstances.",
    "url": "https://www.sec.gov/newsroom/press-releases/2026-100-sec-proposal-would-address-how-investment-advisers-funds-can-custody-crypto-assets-under-federal",
    "sourceId": "sec",
    "publishedAt": "2026-10-01",
    "regions": [
      "north-america"
    ],
    "jurisdictions": [
      "United States"
    ],
    "topics": [
      "Regulation",
      "Policy"
    ],
    "kind": "Official update",
    "status": "Proposal",
    "reviewedAt": "2026-10-05",
    "statusDetail": "Comment period: 60 days from Federal Register publication. No final rule yet."
  },
  {
    "id": "global-fatf-va-update-2026",
    "title": "FATF reviews virtual-asset implementation gaps",
    "summary": "FATF’s seventh update calls for stronger virtual-asset standards implementation, including Travel Rule supervision and risks involving unhosted wallets and DeFi. The report is guidance, not directly applicable national law.",
    "url": "https://www.fatf-gafi.org/en/news/targeted-updated-va-vasps-2026.html",
    "sourceId": "fatf",
    "publishedAt": "2026-07-16",
    "regions": [
      "global"
    ],
    "jurisdictions": [
      "Global"
    ],
    "topics": [
      "Regulation",
      "Policy"
    ],
    "kind": "Official update",
    "status": "Official update",
    "reviewedAt": "2026-10-05",
    "statusDetail": "Domestic obligations depend on national law."
  },
  {
    "id": "us-tornado-cash-delisting-2025",
    "title": "Treasury removed Tornado Cash sanctions",
    "summary": "Treasury removed economic sanctions against Tornado Cash on 21 March 2025. The delisting is a specific administrative action, not a general exemption from sanctions or other financial-crime laws.",
    "url": "https://home.treasury.gov/news/press-releases/sb0057",
    "sourceId": "treasury",
    "publishedAt": "2025-03-21",
    "regions": [
      "north-america"
    ],
    "jurisdictions": [
      "United States"
    ],
    "topics": [
      "Privacy",
      "Regulation"
    ],
    "kind": "Official update",
    "status": "Official update",
    "reviewedAt": "2026-10-05",
    "statusDetail": "Historical context. Other sanctions and financial-crime obligations remain separate."
  }
];

export const LEGAL_SOURCES: LegalSource[] = [
  {
    "id": "bcb",
    "name": "Banco Central do Brasil",
    "url": "https://www.bcb.gov.br/acessoinformacao/rss",
    "role": "Primary authority",
    "mode": "live"
  },
  {
    "id": "rfb",
    "name": "Receita Federal",
    "url": "https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/criptoativos/decripto",
    "role": "Primary authority",
    "mode": "curated"
  },
  {
    "id": "cnv",
    "name": "Argentina · CNV",
    "url": "https://www.argentina.gob.ar/cnv/registro-de-proveedores-de-servicios-de-activos-virtuales",
    "role": "Primary authority",
    "mode": "curated"
  },
  {
    "id": "eurlex",
    "name": "EUR-Lex",
    "url": "https://eur-lex.europa.eu/eli/reg/2024/1624/oj/eng",
    "role": "Primary authority",
    "mode": "curated"
  },
  {
    "id": "sec",
    "name": "U.S. SEC",
    "url": "https://www.sec.gov/newsroom/press-releases",
    "role": "Primary authority",
    "mode": "curated"
  },
  {
    "id": "fatf",
    "name": "FATF",
    "url": "https://www.fatf-gafi.org/en/topics/virtual-assets.html",
    "role": "Primary authority",
    "mode": "curated"
  },
  {
    "id": "treasury",
    "name": "U.S. Treasury",
    "url": "https://home.treasury.gov/news/press-releases",
    "role": "Primary authority",
    "mode": "curated"
  }
];
