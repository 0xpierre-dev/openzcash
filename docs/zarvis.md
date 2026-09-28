# Zarvis

Zarvis is the OpenZcash AI guide: `/zarvis`, the navigation entry, and a floating conversation on public workspace pages. The UI follows OpenZcash's light and dark themes. Answers follow the language of the question; the interface itself stays in English.

## Language selection (2026-09-28)

The interface is English by design (placeholder, starters, statuses, buttons, privacy text); it says so where it matters: the composer reads "Ask Zarvis about Zcash, in any language…" and the welcome screen states that Zarvis answers in Portuguese, Spanish, English and more. No string table or locale toggle exists, and page chrome is not translated.

Answers follow the question. `src/lib/zarvis/language.ts` decides the answer language for every deterministic block with one detector: an explicit stored preference ("Responda em português" / "Answer in English") wins; otherwise the latest user turn whose words score a strict majority for one language: function words count 2 (como, onde, quais, são, que, de/do/da, um/uma, o/a/os/as, para, com, não, e, em, … versus what, how, the, is, and, in, on, at, from, …) and the few domain nouns the direct templates accept count 1 (saldo, dados, tesouraria, chave, … versus price, treasury, balance, grants, viewing key, …), so "Como funciona a viewing key?" and "Qual o treasury balance da ZCG?" are Portuguese while "a viewing key" is English. Spanish and French word lists exist so that "¿Cuál es el precio actual de ZEC?" or "¿Qué es ZIP 317?" is never read as Portuguese; a tie between Portuguese and Spanish or French on shared words ("Saldo ZCG") goes to Portuguese, the only one of them with direct templates, whereas a tie that involves English ("Zashi on OS") is undecided. Wordless and undecided turns such as "2025" or "ZIP 317" inherit the previous user turn's language; the default is English. The same flag drives direct answers, reviewed FAQ text, calculator blocks and the grounding fallbacks on the model path, so an answer is never mixed-language. Deterministic templates exist only in English and Portuguese: a question in another language has no direct template and goes to the model, whose instructions still say to reply in the user's language; a stored `es`/`fr` preference disables the direct route entirely for the same reason.

## Provenance badges (2026-09-28)

Every `done` event carries `provenance`: `route` (`local` or `model`), `model` (the configured model id for model answers, `null` for direct answers), `webSearch` (a hosted search ran), `groundingFallback` (unsupported figures were replaced), `withheldFigures` (how many; never the text) and `language` (`en`/`pt`, the language of the deterministic parts). Under each answer the chat renders one badge in the answer's language: "Direct from OpenZcash data · no AI" / "Direto dos dados OpenZcash · sem IA" for the zero-cost route, or "Grok 4.7 · 3 sources · check them" / "Grok 4.7 · 3 fontes · confira" (plus "web search" / "busca na web" when a search ran) for model answers; the model name comes from the done event's model id, falling back to the provider label from `GET /api/zarvis`. When a grounding fallback fired, a visible notice says "Some figures could not be verified and were left out" / "Alguns valores não puderam ser verificados e foram omitidos". Retrieval stamps in the sources drawer are printed in UTC. The badge labels the route, not the correctness of the answer; "Zarvis can make mistakes" still applies to both routes.

## Enable

1. Create a **dedicated OpenAI project and restricted API key** for OpenZcash. Allow the Responses API and the selected model. Save the key as `OPENAI_API_KEY` in the server's secret manager / Railway service `zbo`, never in client code or a `NEXT_PUBLIC_` variable. Do not paste it into chat or commit it.
2. Apply the additive `0005_zarvis_usage` migration through the existing boot migration process. It creates only short-lived request counters, not a conversation table. Requests fail closed if the table/database is unavailable.
3. Set `ZARVIS_ENABLED=true`. The defaults are `ZARVIS_MODEL=gpt-5-mini`, `ZARVIS_WEB_SEARCH=true`, `ZARVIS_DAILY_REQUEST_LIMIT=100`, and `ZARVIS_HOURLY_REQUEST_LIMIT=30`. The production request origin is pinned to `https://openzcash.org`; set `ZARVIS_ORIGIN` explicitly for a preview domain or a local listener whose internal hostname differs from the browser URL. Forwarded host headers cannot expand this allowlist. Set `ZARVIS_ENABLED=false` to turn off paid calls immediately. The feature stays disabled by default until deliberately enabled.
4. Test a basic privacy explanation, a current treasury query, an external protocol question, and a Portuguese follow-up. Check citations, reporting dates, source failures, light/dark modes and mobile. A rendered UI or configured key is not proof that a billed model call succeeded.
5. Set a project budget alert and appropriate billing controls in OpenAI. **App request limits are not a dollar billing cap.** Inspect actual usage before raising them.

## Local testing without request quotas

Set `ZARVIS_LOCAL_UNLIMITED=true` in the local development environment when deliberately testing without hourly, daily or per-network question limits. This setting only takes effect with `NODE_ENV=development` and an explicit HTTP loopback `ZARVIS_ORIGIN` (`127.0.0.1`, `localhost` or `::1`). This local flag never changes production quotas. The flag is false by default.

This mode does not read, increment or reset the quota counters, so an exhausted test counter no longer blocks the preview. Disable the flag to resume ordinary quotas. The origin checks, input limits, per-answer output budget, deadline and stop/cancel behavior still apply. Model-assisted answers continue to use the configured provider and incur its normal API costs. Deterministic local answers make no model call. All submitted questions count toward request quotas unless local testing or the explicit launch window below is active.

## Temporary launch window

Set the server-only `ZARVIS_QUOTA_PAUSE_UNTIL` to an explicit UTC expiry such as `2026-09-29T03:00:00.000Z` (midnight ending September 28 in Sao Paulo). The override is active only during the final 24 hours before that instant. Omitted, malformed, timezone-less, expired or more distant values keep normal quotas. The server rechecks the clock for every request; at expiry it automatically resumes the configured global quotas and ordinary network quotas without a restart or scheduled job. Clear the variable to end the window early.

During this window, global hourly/daily and per-network question counters are bypassed without reading, incrementing or resetting them. Existing counters remain intact for normal enforcement afterward. Accepted in-flight answers can finish under their existing deadline. The feature enable switch, origin/body checks, per-process concurrency, token/tool budgets and deadlines still apply. Model-assisted answers incur normal provider costs; there is no request-count cap during the window, so set the estimated-spend ceiling `ZARVIS_DAILY_USD_CAP` (see Operations), which is checked before the pause exemption. Direct answers still make no model call.

The authenticated `GET /api/zarvis/metrics` response includes `quota.paused`, `quota.resumesAt` (the configured UTC expiry), and the normal `dailyLimit` / `hourlyLimit`. This is current policy, not usage counters. Public readiness does not disclose these settings.

## Cost reference (checked 2026-09-28)

Built-in list rates in `src/lib/zarvis/pricing.ts` (`MODEL_RATES`), standard tier, prompts below each provider's long-context threshold, USD per million tokens plus the hosted web-search fee per call:

| Model | Input | Cached input | Output | Web search / call | Source |
| --- | ---: | ---: | ---: | ---: | --- |
| grok-4.7 (production default for xAI) | $2.00 | $0.50 | $6.00 | $0.005 ($5 / 1k calls) | https://docs.x.ai/developers/pricing, read 2026-09-28 |
| grok-4.6 | $2.00 | $0.50 | $6.00 | $0.005 | same page; prompts of 200k+ tokens are billed at double these token rates |
| gpt-5-mini | $0.25 | $0.025 | $2.00 | $0.01 ($10 / 1k calls) | https://developers.openai.com/api/docs/pricing, read 2026-09-28 |
| gpt-5 | $1.25 | $0.125 | $10.00 | $0.01 | same page |
| gpt-6-astra | $10.00 | $1.00 | $50.00 | $0.01 | same page; cache writes ($12.50 / M) are not modelled |

`estimateUsageUsd` prices every completed model answer for a listed model without further configuration. `ZARVIS_INPUT_USD_PER_MILLION`, `ZARVIS_CACHED_INPUT_USD_PER_MILLION`, `ZARVIS_OUTPUT_USD_PER_MILLION` and `ZARVIS_SEARCH_USD_PER_CALL` override individual fields (and are the only way to price an unlisted model). Search-content tokens are billed at model rates and appear in the reported token usage. Example with grok-4.7: 10,000 input (4,000 cached) + 1,000 output tokens + one search = $0.025. A model-assisted question can use up to three model requests (four for deeper analysis); history, instructions and retrieved sources all count as input. Estimates are not invoices: a failed or aborted answer is priced from the usage reported before the failure (a lower bound that still counts toward the daily cap), provider calls may be billed beyond what was reported, and long-context tiers are not modelled. Re-check the pricing pages when changing `ZARVIS_MODEL`.

## Flagship local evaluation (2026-09-26)

The local preview was switched to `ZARVIS_MODEL=gpt-6-astra` at the user's request, using the existing server-only key. At that evaluation, reasoning was `low` and output was limited to 3,000 tokens per model call, and there is no automatic fallback to another model. This is a preview configuration, not a change to Railway or the default model above.

Current standard GPT-6 Astra pricing per million tokens: **$10 input, $1 cached input, $12.50 cache writes, $50 output**. Reasoning tokens and repeated context count toward usage; web search has separate fees. Check actual project usage before choosing a production model. Source: https://developers.openai.com/api/docs/models/gpt-6-astra and https://developers.openai.com/api/docs/pricing.

See [the conversation evaluation](zarvis-conversation-evaluation.md) for the actual comparison, latency, token usage and limits. The provider returned three hosted web-search items in one response despite the requested tool budget of two; this parameter must not be represented as a guaranteed billing cap. The enforced app request limits, output budget and deadline remain separate controls.

## OpenZcash first (2026-09-27)

1. `scripts/build-zarvis-knowledge.mjs` extracts visible public text from an explicit allowlist of 54 source files. The generated index currently contains 109 chunks. `predev` and `prebuild` regenerate it; `npm test` checks it matches its sources. No repository crawl, private routes, environment files or code execution is involved. Rebuilding covers published local edits, not arbitrary changes on external websites.
2. A bilingual lexical search selects at most four documents within a 5,000-character budget. Short continuations can use the preceding exchange; a new subject searches for itself. Curated notes and selected navigation accompany the public page excerpts; the whole website is never injected into every prompt.
3. Supported factual questions use deterministic replies with zero model calls: USD prices; ZCG/Lockbox reported or estimated holdings; annual/all-time ZCG and coinholder paid-grant aggregates with optional explicit project fragments; reviewed EN/PT basics and site links; and exact numbered ZIP metadata with an official abstract excerpt. Plain latest-ZIP questions use the fresh complete catalog's Created ordering. Known continuations such as “e em 2025?”, “e o Lockbox?” and “and ZIP 32?” retain their specific scope. Unknown prior instructions, extra requirements and ambiguous continuations go through synthesis. See [direct-answer coverage and evaluation](zarvis-direct-answers.md) for limits.
4. Other requests get relevant public evidence before synthesis when the topic is clear. `query_openzcash_ledger` computes totals over the complete selected dataset by program, calendar year and optional literal name fragment. It preserves negative returns, excludes test entries, reports missing currency values and uses payment dates. It never totals excerpts. Program scopes are separate; USD budget values of paid entries are not bank settlements or today's ZEC valuation.
5. Questions outside those direct templates use the selected model with a stable instruction prefix, recent conversation and bounded evidence. Additional local lookups and `request_external_research` are available. ZIP questions first read the complete official local catalog; current external protocol/release questions without catalog evidence may start with web search enabled; otherwise the model must request it because local evidence is missing or too old. Lack of search access must be disclosed.

Ledger aggregate caches hold public totals for up to 60 seconds, use the import version and a hash of filters as the key, coalesce simultaneous reads, and retain at most 100 entries. They contain no chat history or generated answers. Existing quote/dashboard reader caches retain their original freshness semantics. A quote can be cached and fresh; a saved stale quote is never the deterministic current-price answer.

This is retrieval, not training or permanent model memory. It covers indexed public documentation and the wired data readers, not every linked PDF, full news article, future page or external website. Reports/records retain their publication, import and observation dates. The model still spends tokens reading evidence and writing explanations. No blanket percentage cost saving is guaranteed.

## Prepare or switch to Grok

The OpenAI configuration stays active until deliberately changed. To use Grok, set these server-side variables together:

```dotenv
ZARVIS_PROVIDER=xai
ZARVIS_MODEL=grok-4.7
XAI_API_KEY=<secret-manager-value>
```

OpenAI uses `ZARVIS_PROVIDER=openai`, `OPENAI_API_KEY` and the explicitly configured `ZARVIS_MODEL`. If no model is set, the defaults remain `gpt-5-mini` for OpenAI and `grok-4.7` for xAI. Missing Grok credentials do not silently fall back to OpenAI. Unknown providers disable the endpoint. Readiness and privacy copy follow the configured provider.

The adapter uses fixed provider hosts, the Responses API, `store: false`, bounded reasoning/output by response depth, no automatic retries and the shared app deadline described below. It requests `max_tool_calls: 2` with OpenAI and the documented `max_turns: 2` with xAI. Grok search receives at most five allowed primary/community domains and no OpenAI-only verbosity setting. Encrypted reasoning is explicitly requested for both providers and forwarded unchanged within a stateless tool loop. Neither provider's requested hosted-tool limit is presented as a dollar cap. Grok has been contract-tested and exercised locally with real 4.6/4.7 responses; see the dated evaluation reports for results and limits.

Official integration references: [Grok 4.7](https://docs.x.ai/developers/grok-4-7), [Responses contract](https://docs.x.ai/developers/rest-api-reference/inference/responses), [web search](https://docs.x.ai/developers/tools/web-search), [xAI data policy](https://docs.x.ai/developers/faq/security), [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

## Knowledge and freshness

- Curated, dated background: privacy, Unified Addresses, viewing keys, issuance/halvings, funding rules, ledger interpretation, treasury scenarios, governance and ecosystem navigation (`src/lib/zarvis/sources.ts`). This is a reviewed starting library, not a claim of exhaustive or automatically current knowledge.
- Live read-only tools: a dedicated ZEC/USD quote at `/api/zec-price` (from the shared price oracle, with provider time, retrieval time and stale flag), plus public treasury, markets, grants, recipients, disbursements, ZCG grant applications and decisions, coinholder, ZecHub, ecosystem, wallets, communities, Arborist calls, chain and supply readings, historical daily closes, news, funding history, site documentation, meetings, elections, published totals, payment schedules, Maya transfers, governance records and monthly reading sets (see the data-coverage table below). The tool calls explicit public readers; the model cannot supply URLs, database queries or private routes. Records are bounded and truncation is labeled. Reporting dates and stale flags remain attached.
- Provider web search can consult a fixed list of Zcash reference/community domains for long-tail and current external information. Community content remains untrusted evidence, not official consensus. ZIPs use the complete internal official-source catalog and a dedicated lookup tool. Missing or stale information can use official external sources. ZCG grant applications are never treated as protocol ZIPs. Disable search with `ZARVIS_WEB_SEARCH=false` if desired; the assistant must disclose missing current evidence.
- Returned citations are rendered as safe Markdown links. The source drawer includes consulted live sources even if the model omits an inline link, plus explicitly cited curated background. Bare-URL citations also retain their source entry. AI citations are not independent verification; users can inspect the evidence.
- Review curated notes after protocol upgrades, source changes or new treasury methodology. Do not ingest the private repository, keys, private wallet scans, admin routes or confidential material.

## Data coverage (2026-09-28)

Every `lookup_openzcash` topic, the reader it calls and how fresh its answer can be. "Automatic" means `relevantTopics()` selects it from the question before synthesis; every topic is also available to the model on request. Readers marked "query-filtered" receive the normalized question (`arborist`, `wallets`, `communities`, `decisions`, `price_history`), so a call number, wallet or community name, outcome or month narrows the rows before the serialized excerpt (5,000 characters; 7,000 for `wallets` and `communities`, whose whole inventory and revision date are serialized ahead of the rows so the budget cuts rows first); the other automatic lookups still run with an empty query. Provenance keys (dates, notes, `verifiedOn`/`catalogRevisedOn`, `all*` inventories) are ordered first by `compactData`; row arrays are never mistaken for provenance.

| Topic | Source | Freshness carried in the answer | Automatic routing |
| --- | --- | --- | --- |
| `price` | `/api/zec-price` (shared quote oracle) | `quotedAt`, `fetchedAt`, `stale` | "price / preço / cotação" |
| `price_history` | `src/data/funding/days.json` (Bitfinex ZEC/USD daily closes, regenerated by `scripts/gen-funding-history.ts`) | `generatedAt`, `through` date; period summary with dated low/high/average; "no recorded closes" when the period is outside the dataset | a price word (price/preço/cotação, "quanto era/vale o ZEC", "how much is/was ZEC") plus a year, "history", "ago" or "last month/year"; a month name alone is not a date, so "price and market cap" or "what may affect the price" stay on the live quote (query-filtered: day, month or year in EN/PT) |
| `chain` | `cachedChainTip()` (lightwalletd, 60 s cache), `chainSupplyFeed()` (CipherScan value pools), `currentZecCirculatingSupply()` (CoinGecko) | tip `readAt`; supply `fetchedAt`/`stale`/`atHeight`; circulating `quotedAt`; next-halving height and an estimated date at 75-second spacing labelled as an estimate; each missing feed is `null` with a note, never zero | block height, halving, shielded/circulating supply, value pools |
| `mining` | ZcashInfo mining overview | block window, heights, timestamps, freshness | current hashrate/solrate |
| `treasuries` | Dev Fund report + quote + circulating supply | report `snapshotAt`, `importedAt`, estimate block, quote time, stale flags | treasury, balances, lockbox |
| `markets` | ZEC Observatory dashboard | snapshot `updatedAt`, per-source `fetchedAt`/status | model request |
| `grants`, `recipients`, `disbursements` | ZCG ledger mirrors (`/api/zcg/data/*`) | `ledgerImportedAt` | grants/zcg, recipients |
| `proposals` | `/api/zcg/office` (GitHub applications under review, D-1 rule) | `createdAt` per application | proposals, grant/funding applications, applicants, "under review" (not ZIPs; "mobile application" is not a grant) |
| `decisions` | `listProposals()` + `getMeetings()` + `listGrants()` through `proposalDecisions()` (the /zcg/decisions model), plus applicant withdrawals/cancellations | `publishedThrough` (D-1 publication day), `importedAt`, decision dates, status counts over the whole sheet; Application (GitHub issue) and Minutes links | approved/rejected/withdrawn/decided/verdict words, except in a ZIP question ("Was ZIP 1015 approved?" is not a grant verdict) (query-filtered: outcome, year, program, title words). A failed `getMeetings()` or `listGrants()` reader is named in `unavailableSources` and a DEGRADED note, never shown as rows without links |
| `coinholder` | `/api/zcg/coinholder/round` | round dates as published | coinholder |
| `zechub` | `/api/zechub/treasury` | sheet timestamps | zechub |
| `ecosystem` | `src/data/ecosystem` registry + snapshot | `registryCheckedAt`, `repositorySnapshotAt` | ecosystem, repositories, zebra/zaino/zingo |
| `wallets` | `src/app/wallets/catalog-data.ts` (the /wallets catalog) | `catalogRevisedOn` (`WALLET_CATALOG_REVISED_ON`: the date of the last edit to the entries, maintainer-set in the same commit, not a review of every wallet); shielded level, platforms, site/source/audit links; `allWallets` inventory so an absent wallet is reported as not catalogued | wallets/carteiras, wallet names including a former name in the note ("Zashi" selects Zodl) (query-filtered: name, platform, shielded level, hardware/software; generic words such as open, source, audit, mobile never narrow the pool) |
| `communities` | `src/lib/communities/data.ts` (the /communities directory) | `verifiedOn` (`COMMUNITIES_VERIFIED_ON`: the per-link verification pass of 2026-09-20); ledger-budgeted USD, grants, `lastPaidDate` for funded groups; `allCommunitiesByRegion` inventory; rows carry the site, forum user and two latest forum topics, the page carries the rest | communities/comunidades, "community in/of", "Zcash community", ambassador, community names and countries; not "Zcash Community Grants" nor a bare "the community decided" (query-filtered: name, country, region, language, funded) |
| `arborist` | `getArboristCalls()` (ZcashCommunityGrants/arboretum-notes + Zcash Foundation YouTube feed, 1 h cache) | `archiveFetchedAt`, meeting `date` per call, `source` (published notes / historical agenda / recording only), notes and recording links | arborist, arboretum, engineering call, "call #131", reunião arborist (query-filtered: number (`#131`, `call 131`, `no. 12`, at most three digits, so "no 12 de março" is a date), month, agenda word; next/próxima/quando/upcoming are noise, so a next-call question returns the latest calls) |
| `news` | feeds (`/news`) | `feedFetchedAt` | news/notícias |
| `funding_history` | `/api/funding/history` | `generatedAt`, `through` | funding history |
| `site` | knowledge index (`public-content.json`, incl. the wallet catalog and community directory records) | source revision; curated notes carry `reviewedOn` | model request |
| `meetings`, `elections`, `totals`, `schedule`, `investments`, `governance`, `monthly` | governance tables, published pivots, schedule, Maya transfers, `record.json` + upgrades, monthly catalog | row dates, `checkedAt` where the source has one | meetings, elections/committee, scheduled, maya/investments, monthly |

The wallet catalog and the community directory are both indexed as dated site-documentation records (one chunk per wallet or community, built from the same `.ts` files by `scripts/build-zarvis-knowledge.mjs`) **and** exposed as query-filtered topics. Indexing was the cheaper half: the builder already turns `.ts` reference records into per-record chunks through `publicSections`, so the two files only needed listing (plus the `maker`, `shielded`, `country`, `region`, `language`, `about` fields); the wallet data had to move out of the `"use client"` page component into `catalog-data.ts` so a server reader could import it at all. The topics add what retrieval cannot: complete inventories, structured filters and the revision date on every answer.

Citations: `safeSourceUrl` renders links whose host is one the site's own datasets cite (`CITATION_DOMAINS` in `src/lib/zarvis/sources.ts`: the hosted-search domains plus YouTube, CipherScan, zcashcommunitygrants.org, the Helios/SIV/vote-chain tallies in the governance record, the wallet makers' sites and audit hosts, the community sites and substacks) or a GitHub organization the site imports from or lists (ZCG applications and Arborist notes, FPF coinholder rounds, ECC, ZF, ZecHub, Zingo, Shielded Labs, Zodl, zecdev, Nighthawk, QED-it and the catalogued wallets' repositories). Everything else, including Google Docs, social profiles and any host the model invents, is still de-linked. `src/lib/zarvis/sources.test.ts` asserts that every wallet, community, coinholder-round and governance-record URL survives and that lookalikes, credentials, ports, `http:` and unknown GitHub organizations do not.

## Data and safeguards

Conversation state stays in browser memory and survives ordinary workspace navigation. Reloading or New chat clears it. The backend does not write prompts or replies to a database or logs. For model-assisted responses, it sends complete recent turns to the selected provider with `store: false`, preserving short confirmations and partial replies with an interruption label. Oldest turns are omitted together when the character, message or UTF-8 byte budget is reached. Explicit language/detail/currency preferences and typed calculator assumptions are carried separately in browser memory, so these survive trimming without storing a transcript or an invented summary. New chat/reload clears them. Saved assumptions are untrusted user input, never verified current balances. Curated background selection considers both sides of the recent exchange, because a follow-up may refer to a subject introduced by the assistant. This does not exempt provider abuse-monitoring retention; the UI links to the provider's policy. Hosting access logs are separate.

A daily HMAC digest of the proxy-reported network address keys short-lived abuse counters. Raw addresses and messages are not persisted by this feature. Counters expire at the end of their windows and are removed on subsequent requests; they are not audience analytics or unique-person counts. Proxy-derived network quotas are advisory; atomic global caps remain effective even if headers are forged. No location or identifier is sent to the model provider as a search location / user identifier.

Chat and feedback JSON uploads have an absolute five-second read deadline and cancel on timeout or disconnect. The server enforces a 32 KiB chat request body, up to 40 recent messages / 18,000 characters, a 2,000-character question, at most three model rounds (four for deeper analysis), up to two automatic public lookups plus three model-requested local lookups (five for deeper analysis), two requested hosted-tool calls for OpenAI or two server-side rounds for xAI per model call (a round may contain multiple searches), 3,000 output tokens per model call (6,000 for deeper analysis), no automatic provider retries and a 55-second generation deadline (110 seconds for deeper analysis). Usage limits default to 5 requests per network per 10 minutes and 20 per day (`ZARVIS_NETWORK_WINDOW_LIMIT`, `ZARVIS_NETWORK_DAILY_LIMIT`), plus the global hourly/daily limits (`ZARVIS_HOURLY_REQUEST_LIMIT`, `ZARVIS_DAILY_REQUEST_LIMIT`) in Postgres; the global caps accept up to 1,000 per hour and 10,000 per day. Failed/aborted requests consume their reservation to prevent retry abuse. A request can still incur cost before cancellation. Source content and user-supplied instructions cannot grant access to additional tools.

The UI renders no model-generated HTML or images. No third-party model endpoints are exposed in browser CSP; calls and the API key stay server-side. The model cannot send transactions, access funds, execute scripts, contact others or modify records.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Manual desktop/mobile checks, streaming / stop / retry / new chat, source links and navigation continuity.

Set `ZARVIS_DIAGNOSTICS=true` only in development to print per-answer route, model/call counts, hosted-search item counts and provider-reported token totals/cache hits. No conversation text, reasoning, raw provider errors, IPs or credentials are logged by these diagnostics; the flag is ignored in production. These are measurements, not invoice calculations (cache writes, reasoning and tool charges may differ).

Real-provider smoke tests require a securely configured funded provider account. Distinguish deterministic local replies from real model responses. See [the local knowledge evaluation](zarvis-local-knowledge-evaluation.md) for September 27 results and limits.


## Internal quality layer (September 27)

- **Retrieval:** inverse-frequency ranking, length normalization, title weighting, bilingual concepts and per-source diversity. Selected context remains limited to four excerpts / 5,000 serialized characters. A match is evidence to inspect, not a confidence guarantee.
- **Public reference corpus:** all 127 numbered ZIP documents and 7 unnumbered drafts at the recorded official repository revision, plus selectable text from the four currently published Monthly/Operations PDFs. ZIPs preserve full source text, title, all revision-specific statuses, Created/Last-Updated fields when present, license, Git blob hash, SHA-256 and the pinned commit URL. PDFs preserve their URL, retrieval time, evidence cutoff and SHA-256. The deployment starts from committed text; chat requests do not download/parse PDFs. Charts/images are not OCR. External news articles remain external research; headlines alone never establish their full contents.
- **Refresh:** `npm run knowledge:sync:zips` imports only numbered/draft `.rst`/`.md` files from `zcash/zips`, plus its README and license, at one pinned commit. Four parallel readers, source size limits, Git blob integrity, completeness checks and an atomic write protect the last complete snapshot. `npm run knowledge:sync` also updates explicitly published PDF text (Python 3 and Poppler required for PDFs). Website text rebuilds during normal builds. The runtime ZIP cache revalidates on demand after six hours, coalescing requests: unchanged revisions need one GitHub metadata call; changed revisions need the tree and at most 12 changed public files within an eight-second deadline. Larger changes require an offline sync. No AI search, credential or conversation is sent to GitHub. A failed refresh preserves dated evidence, marks it stale and backs off for one minute. This cache is per process and resets on restart, not a background scheduler. Publication, creation, revision and network activation remain distinct.

- **Treasury tool:** calls the same pure engines as the calculator, including halvings, supply denominator, fixed miner share, one future purchase, dev-fund continuation and community budget coverage. Default horizon is one year; default company balance is the documented August 31 record; default annual budget is cumulative milestones divided by five assumed years. Defaults and dates are stated. Each calculation reads public snapshots again; the returned link freezes the exact numerical inputs for reproduction. The tool supports company, community or both. Scenario responses use deterministic Portuguese/English templates, rather than model-generated monetary arithmetic.
- **Source outages:** supported USD quote, treasury and paid-grant questions return dated cached data or an unavailable response locally. They never interpret a missing record as zero or pay a model merely to explain a feed outage. Qualified/conversational questions retain model reasoning and source checks.
- **Financial checks:** monetary/ZEC/percentage figures in model answers based on financial tools are matched against their typed numeric evidence, including computed same-scope ledger year comparisons and, for treasury evidence, the site's own derived figures (per-pool and combined valuations at the quote, ZEC totals, shares of supply and the ZIP 1015 subsidy split). Unsupported figures trigger a grounded fallback. Output stays buffered until this check completes. This is a numeric/unit check, **not** universal semantic entailment, an audit of the source records, or proof that every claim in an answer is correct.
- **Session:** scenario changes merge into typed previous assumptions; an explicit future price replaces a multiple and vice versa. Preferences are data, not instructions elevated above system rules. Large histories still have a bounded recent-turn window; arbitrary old details are not permanent memory.

## Operations and feedback

`ZARVIS_MAX_CONCURRENT` defaults to eight active generations per server process (bounded to 32). Excess requests receive 429/Retry-After before a model call. This also applies during unlimited local testing and a temporary launch window. Outside those explicit exceptions, atomic global request quotas in Postgres remain the cross-replica cost/abuse safeguard; per-process concurrency is not a global dollar cap.

`GET /api/zarvis/metrics` requires the existing admin session and returns `{ process, quota, alerts, daily }`. `process` holds this server process's counters since restart: completed/failed/aborted, the pre-generation rejections (`busy`, `quota`, `spendCap`, `storage`, `forbidden`, `invalid`), local/model routing, tokens/cache hits, numeric fallbacks, feedback, latency buckets and the durable-store write/read failure counts. `daily` holds the last 14 UTC days from the `zarvis_metrics_daily` table (see Observability below); `quota` adds the configured cap and today's estimated spend; `alerts` reports the rolling failure window and how many alerts were sent. Set `ZARVIS_AGGREGATE_METRICS=true` to also print the process counters at most once a minute when traffic arrives. No prompt, reply, credential, raw IP or visitor identifier is added to these metrics. Hosting logs are separate.

Cost estimates use the built-in rate table above for the active model; the `ZARVIS_*_USD_PER_MILLION` / `ZARVIS_SEARCH_USD_PER_CALL` variables override single fields. An unlisted model without overrides, or usage missing from any model round, means **unpriced**, never zero; with `ZARVIS_DAILY_USD_CAP` set, an unpriced model answer sends the `unpriced_usage` alert because the cap cannot count it. Estimates are not provider invoices; failed/aborted requests are counted from the usage reported before the failure and may incur further unreported charges. `ZARVIS_DAILY_USD_CAP` is an application ceiling on the estimate, not a replacement for the provider's billing controls.

Answer feedback sends only a signed one-hour ticket and a useful/needs-work vote. Tickets contain a random nonce/expiry and the answer route (`local` or `model`, so votes can be attributed per route in the daily table), no question, answer, identity or scenario. Votes are deduplicated per process with bounded memory; counters are directional feedback, not an authenticated survey. The backend rejects arbitrary feedback text. Calculator links contain public numerical assumptions, not chat text.

## Repeatable evaluation

- `npm run eval:zarvis`: offline retrieval, arithmetic, assumptions, continuity, grounding, limits and feedback cases. No model tokens or model-as-judge scoring.
- `python3 scripts/eval-zarvis-live.py --confirm-paid`: synthetic loopback-only conversations against the existing configured provider. This can incur costs; the script never loads a credential. Results are written to a temporary file for semantic review.
- The quality workflow runs runtime dependency auditing, full tests, types, index checks and scoped lint for relevant pull requests, without AI credentials.
- See [internal evaluation](zarvis-internal-evaluation.md) for measured results and the distinction between retrieval checks, mocked contracts and real-provider conversations.

## Preproduction audit

See [the September 27 audit](zarvis-preproduction-audit.md) for corrected findings, the latest local verification results, the development-tool dependency follow-up, and the remaining production/CI/Grok release gates. The feature remains disabled in production pending those checks.


## Live Grok validation

The selected candidates are Grok 4.6 and 4.7. See [the real-provider evaluation](zarvis-grok-evaluation.md) for credential setup, observed fixes, usage and the original newest-ZIP research timeout. [The ZIP catalog evaluation](zarvis-zip-catalog-evaluation.md) records the subsequent internal-catalog implementation and before/after measurements. `scripts/eval-zarvis-live.py --confirm-paid --extended` adds bare-confirmation and live-research cases. The local preview uses 4.7; this does not enable production.

## Complete ZIP catalog (September 28)

The catalog is retrieval, not model training. Explanations still use the selected external model with bounded local evidence; hosted web research is reserved for missing/stale facts. `lookup_zcash_zips` retrieves additional passages within the selected response depth's local-lookup limit. Document section ancestry is retained to distinguish pool-specific rules, and ZIP 310 retains its full-viewing-key assumptions.

A plain one-turn “What is the latest ZIP?” / “Qual é o último ZIP?” can answer without a model call when the catalog is fresh. It ranks the `Created` header, states missing dates and explicitly does not claim first publication or activation. Qualified questions and conversations continue through synthesis. Unknown identifiers are reported as absent from the snapshot, never proof that no proposal exists elsewhere. Newest-by-creation, highest number and source revision are different fields.

Run `python3 scripts/eval-zarvis-zips.py --confirm-paid` for four synthetic loopback cases: one local reply and three model-assisted questions, including the original timeout query and a technical follow-up. Tool loops may make multiple model requests; the flag acknowledges possible charges. This script never loads credentials.


## Response depth and analytical follow-through — 2026-09-27

The composer offers **Auto**, **Quick** and **Deep analysis**. This selection is transient browser state and is a validated enum in the request; callers cannot choose arbitrary time or token budgets. Auto uses a local bilingual intent check. A short confirmation can inherit analytical intent from the preceding exchange.

| Mode | Reasoning | Model rounds | Model-requested local lookups | Output tokens / call | Generation deadline |
| --- | --- | --- | --- | --- | --- |
| Quick; ordinary Auto questions | low | 3 | 3 | 3,000 | 55 s |
| Auto analytical questions | medium | 4 | 5 | 6,000 | 110 s |
| Explicit Deep analysis | high | 4 | 5 | 6,000 | 110 s |

Provider timeouts are 50 / 90 seconds within those overall generation deadlines. These are upper bounds, not latency promises or spending caps. Quick still addresses requested analysis, with a smaller budget. Auto can miss unusual phrasing; the explicit selection overrides routing. Deep analysis uses the configured provider/model, not a separate model. Supported effort levels were checked against the [Grok 4.7 documentation](https://docs.x.ai/developers/models/grok-4.7).

Simple numeric treasury questions retain the deterministic calculator reply. Analytical scenarios retain that verified numeric block and then synthesize interpretation, limitations and requested sensitivity checks. The existing unsupported-amount check also runs on that analysis. This checks numeric provenance, not full semantic correctness. Final model rounds cannot request tools and must return an answer or a specific evidence gap rather than a promise to look something up later.

ZIP retrieval includes scope notes for ZIP 310 and revision-specific caveats for ZIP 317. Created/Last-Updated, retrieval time, specification status and actual network activation remain distinct. See [the refinement evaluation](zarvis-refinement-evaluation.md) for real local responses, failed iterations and release limitations.


## Observability and operations (2026-09-28)

Everything in this section records counts, labels, durations and money. No question, answer, prompt, provider error body, raw IP or visitor identifier is logged or stored.

### Request log line

`POST /api/zarvis` prints exactly one single-line JSON record per request through `console.info` (visible in the Railway deploy logs, `event` = `zarvis.chat`):

```json
{"event":"zarvis.chat","at":"2026-09-28T19:02:11.512Z","route":"model","outcome":"completed","depth":"quick","ms":6120,"modelCalls":2,"webSearchCalls":1,"inputTokens":18320,"cachedInputTokens":9216,"outputTokens":640,"groundingFallbacks":0,"estimatedUsd":0.0301,"errorClass":null}
```

- `route`: `local` (deterministic answer, no model call), `model`, or `rejected` (the request never reached generation).
- `outcome`: `completed`, `failed`, `aborted` (client disconnected), `quota` (Postgres request limit), `busy` (per-process concurrency), `spend_cap` (daily USD ceiling), `storage` (quota table unavailable), `forbidden` (origin), `invalid` (body), `disabled`.
- `errorClass` is a fixed label from `src/lib/zarvis/errors.ts`: `provider_timeout`, `provider_connection`, `provider_http_429`, `provider_http_4xx`, `provider_http_5xx`, `provider_not_configured`, `incomplete_response`, `empty_response`, `tool_limit`, `public_read_timeout`, `model_required`, `deadline` (the app's own generation deadline), `aborted`, `unknown`. Failures are classified inside the answer pipeline (`GenerationFailure`), which also carries the token usage billed before the failure so it is counted.
- `estimatedUsd` is `0` for local answers and `null` when nothing could be priced (unlisted model, or a completed answer with a missing usage report). A `failed`/`aborted` line carries the lower bound priced from the usage reported before the failure.

Rejections are rate limited in the log: the first rejection per outcome in a ten-second window is printed as above, and any further ones in that window fold into one `zarvis.rejections` line (`outcome`, `count`, `windowMs`, `avgMs`), so a flood of forbidden or busy requests cannot push the answer lines past the hosting log rate limit.

The canary prints one `zarvis.canary` line per run (`ok`, `ms`, `passed`, `failed`, `failedCases`, `stored`).

### Durable daily counters

Migration `0006_zarvis_observability` adds `zarvis_metrics_daily` (primary key `day` UTC date + `route`) and `zarvis_canary`. It is applied by the existing boot migration step (`scripts/migrate.mjs` in the Railway start command). Every request outcome, rejection and feedback vote is buffered in process and upserted a few seconds later inside a transaction with a 3-second `statement_timeout`; the write is fire-and-forget; a failed write increments `process.store.writeFailures` and drops that batch (its USD estimate stays in the process spend total), and the first write and first read failure per process also print one `zarvis.store` line with the error class only, so a migration that did not apply is visible in the deploy log. Rows in a batch are upserted in `day|route` order so concurrent flushes from several replicas cannot deadlock, and the latency histogram is added element-wise with `unnest … with ordinality`. Rows keep the same counters as the process metrics plus `estimated_usd` and a 9-bucket latency histogram (bounds 250 ms … 60 s, reported as `dailyLatencyBucketBoundsMs`; the endpoint adds `p50BucketUpperMs` / `p95BucketUpperMs` per row). Because rows are per route, model-route latency is no longer blended with sub-second local answers.

### Daily spend ceiling

`ZARVIS_DAILY_USD_CAP` (e.g. `25`) forbids the provider once the estimated spend for the current UTC day reaches the value: the request still goes through origin, body, concurrency and quota checks and the local pipeline (`localOnly`, the canary's zero-cost mode), so questions the public records answer directly keep working at no cost, while a question that needs the model ends with an error event explaining that today's limit for model-assisted answers was reached (log outcome `spend_cap`, counted as a rejection, no `Retry-After`; the chat stays usable). The estimate is the durable daily total (re-read from Postgres at most every 30 seconds, in the background) plus usage this process has not flushed yet, including the lower bound priced for failed answers, so it is accurate to within roughly 30 seconds across replicas. The check is evaluated before quota reservation and therefore also applies during a `ZARVIS_QUOTA_PAUSE_UNTIL` window. If the table cannot be read, or right after a restart until the first background read completes, the process falls back to what it has counted itself and keeps counting; an unpriced model answer under a cap sends the `unpriced_usage` alert. Unset or invalid means no ceiling.

### Alerts

`ZARVIS_ALERT_WEBHOOK_URL` (https; a Discord or Slack incoming webhook, or anything accepting `{"content": "...", "text": "..."}` JSON) receives at most one message per type per ten minutes per process for:

- `provider_failures`: at least three consecutive failed answers, or at least 25% failed among the last 20 (minimum sample eight; aborted answers are ignored). The message carries counts and the latest error class.
- `rejection_spike`: at least 20 quota/busy/spend-cap rejections in the last ten minutes (only the last 20 timestamps are kept, so `alerts.rejectionsLast10Min` reports at most 20).
- `spend_cap`: the daily USD ceiling was reached; model answers are declined until 00:00 UTC while direct answers continue.
- `unpriced_usage`: a cap is configured but a model answer had no price (unlisted model without rate overrides, or a missing usage report), so the cap could not count it.
- `canary`: a canary run failed, with the failed case labels.

Delivery failures are counted in `alerts.failed`. The variable is never logged or returned by any endpoint; `alerts.configured` only says whether it is set.

### Canary

`GET /api/zarvis/canary` is gated like `/api/cron/refresh`: `Authorization: Bearer $CRON_SECRET` (the existing service secret, minimum 16 characters). It runs the four zero-cost starter phrasings through the real `prepareLocal` / `generateAnswer` path with the provider forbidden (`localOnly`): the privacy FAQ (`STARTERS[0]`), the treasuries starter, `What is the ZEC price?` and `What is ZIP 317?`. Each must finish on the local route with zero model calls, non-empty text, at least one source, and, for the two data-backed cases, the live reader's source URL (absent when the feed fails, which is how the launch-day treasuries outage would have been caught). Results are stored in `zarvis_canary` and returned as JSON; a failed run answers HTTP 503 and sends the `canary` alert. With `ZARVIS_CANARY_MODEL=true` and the assistant enabled, one paid model question (`STARTERS[2]`) is added per run and counted in the metrics like any other model answer (about $0.01–0.05 per run with grok-4.7).

Schedule: `.github/workflows/zarvis-canary.yml` runs hourly (`17 * * * *`) and on demand, calling the URL with the repository secret `ZARVIS_CRON_SECRET` (set it to the Railway `CRON_SECRET`); the job fails when the endpoint answers 503. Equivalent manual call:

```sh
curl --fail-with-body -H "Authorization: Bearer $CRON_SECRET" https://openzcash.org/api/zarvis/canary
```

### Public health and visitor messages

`GET /api/zarvis/health` is public and returns only `{ ok, lastCanaryAt, lastCanaryOk, degraded }`: `degraded` is true after a failed canary less than six hours old or while the provider failure window above is tripped; `ok` additionally requires the feature to be enabled. The chat client reads it once per page and shows "Zarvis is having trouble" / "Zarvis está com problemas" (by browser language) above the composer. On any 429 the client now honours `Retry-After`: the message adds "Try again in N minutes" / "Tente novamente em N minutos" and the send and Retry buttons stay disabled until then.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `ZARVIS_DAILY_USD_CAP` | Optional daily estimated-spend ceiling in USD (recommended in production, e.g. `25`). |
| `ZARVIS_ALERT_WEBHOOK_URL` | Optional https webhook for the alerts above. |
| `ZARVIS_CANARY_MODEL` | `true` adds one paid model question to each canary run. Default off. |
| `CRON_SECRET` | Existing shared secret; also gates `/api/zarvis/canary`. Mirror it as the GitHub repository secret `ZARVIS_CRON_SECRET`. |
| `ZARVIS_INPUT_USD_PER_MILLION`, `ZARVIS_CACHED_INPUT_USD_PER_MILLION`, `ZARVIS_OUTPUT_USD_PER_MILLION`, `ZARVIS_SEARCH_USD_PER_CALL` | Optional overrides of the built-in rate table (required only for a model not listed there). |
| `ZARVIS_AGGREGATE_METRICS` | Existing; prints the process counters once a minute. |

Verification: `npx vitest run`, `npx tsc --noEmit`, `npx eslint src/lib/zarvis src/app/api/zarvis src/components/zarvis`.
