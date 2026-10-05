# Zcash Legal

`/legal` is the news and policy desk. `/legal/pgp` shows Pretty Good Policy for Zcash (PGPZ) public highlights. The shared application registry places Legal after News and provides desktop, mobile and command-palette links.

## Coverage

- Public PGPZ homepage highlights; full memos and the archive can require PGPZ sign-in. No authenticated pages or X scraping are used.
- Banco Central do Brasil's public press-note Atom feed, filtered for crypto, virtual assets and self-custody. This rolling feed is discovery, not a complete archive.
- Reviewed primary-source records from Brazil, Argentina, the EU, the US and FATF. LATAM is a regional filter, not a claim to cover every country.
- PGPZ is independent advocacy and analysis. Regulators' statements, proposals, enacted instruments and legal application dates are distinguished. No per-country legal/illegal score is inferred.

Both live feeds refresh on the first request after one hour. Requests are bounded, use fixed public endpoints, and do not forward credentials or follow redirects. Independent source health identifies live, cached and unavailable retrievals. In-process last-success caches survive a temporary upstream outage but reset on restart. Reviewed source records in `src/lib/legal/curated.ts` provide durable context; dynamic feed items are not a durable full archive.

## Editorial contract

1. Add a verified canonical source, its publisher and actual publication date. Never use retrieval time, a URL date or a report's covered week as publication evidence.
2. A feed that provides only `updated` must set `dateBasis: "updated"`. The UI labels that date explicitly.
3. `effectiveAt` displays as **Applies from**: use the relevant provision's application date, not a document's adoption date. Explain transitional or actor-specific scope in `statusDetail`.
4. Live feed items remain Analysis or Official update. Only reviewed primary records receive legal-effect labels; proposals and guidance must not appear as obligations already in force.
5. Keep summaries short, identify which actors and activity are covered, and link to the original. Broader crypto/privacy context is not necessarily Zcash-specific.
6. Reviewed records take precedence over matching live URLs. Amendments and cancellations need a new source review; no inference from an old article establishes current country-wide legality.
7. Preserve independent source failure states, dated content, accessible filtering, mobile layout and empty states. Never claim full jurisdiction or archive coverage.

Filters (region, topic and search) are shareable in the URL. Links to original articles are explicitly external. No keys, database migration or new dependency are needed.

## Source review and artwork

Initial primary review: `docs/audits/2026-10-05-zcash-legal-sources.json`. Includes exact source URLs, distinct dates and scope notes, including future EU Article 79 application. PGPZ featured publication dates and summaries were verified from `https://community.pgpz.org/` on 5 October 2026.

Official PGPZ logo: `https://pgpz.org/assets/brand/pgpz-primary-on-dark-2048w.png`, saved unchanged at `public/logos/pgpz.png` for the dark brand panel. Attribution links point to PGPZ's site and community.
