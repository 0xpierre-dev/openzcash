
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { Synced } from "@/components/synced";

export const dynamic = "force-dynamic";
export const metadata = { title: "How we compute this · OpenZcash" };

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-stone-800">{title}</h2>
      <Card className="text-sm leading-relaxed text-stone-600">{children}</Card>
    </section>
  );
}

const SOURCES: { name: string; what: string }[] = [
  {
    name: "ZCG public spreadsheet",
    what: "The disbursements ledger, recipient and classification pivots, and ZCG and Coinholder proposal history. Collection is scheduled every six hours. A successful collection does not mean the source was recently edited.",
  },
  {
    name: "GitHub issue tracker",
    what: "Live grant applications (ZcashCommunityGrants/zcashcommunitygrants), read straight from open issues labelled “Grant Application / Ready For Review”. This is the first-hand stage, before anything reaches the spreadsheet.",
  },
  {
    name: "Zcash Community Forum",
    what: "ZCG meeting minutes, imported from the Discourse #grants category.",
  },
  {
    name: "On-chain (lightwalletd)",
    what: "The Lockbox / ZIP-1016 ZEC balance. Market prices, grant approvals and milestone delivery are not facts supplied by this chain balance.",
  },
  {
    name: "CoinGecko",
    what: "The current ZEC/USD market price, cached for approximately ten minutes. If the feed is unavailable, the last cached price or the spreadsheet's recorded rate may be used. This price is not read from the Zcash chain.",
  },
];

export default function MethodologyPage() {
  return (
    <>
      <PageHeader
        title="How we compute this"
        subtitle="OpenZcash is a read-only mirror: it never holds spend keys and moves no funds. Every figure comes from public sources. Here is how."
      />

      <>
        <Section title="Where the data comes from">
          <ul className="space-y-2">
            {SOURCES.map((s) => (
              <li key={s.name}>
                <span className="font-medium text-stone-800">{s.name}</span>:{" "}
                {s.what}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="How each classification is tagged">
          <p className="mb-2">
            On the{" "}
            <Link href="/zcg/totals" className="text-amber-700 hover:underline">
              totals
            </Link>{" "}
            page every classification is labelled by its <em>nature</em>, so a
            reader can tell a grant apart from ZCG spending on itself:
          </p>
          <ul className="space-y-1.5">
            <li>
              <span className="font-medium text-emerald-700">Grant</span>:
              funding paid to an external project or contributor.
            </li>
            <li>
              <span className="font-medium text-amber-700">ZCG operations</span>
              : the committee&apos;s own budget (travel, conferences, tooling);
              the{" "}
              <span className="font-mono text-xs">
                ZCG Discretionary Budget
              </span>{" "}
              bucket.
            </li>
            <li>
              <span className="font-medium text-violet-700">
                Committee stipends
              </span>
              : salaries paid to ZCG members; see{" "}
              <Link
                href="/zcg/stipends"
                className="text-amber-700 hover:underline"
              >
                stipends
              </Link>
              .
            </li>
            <li>
              <span className="font-medium text-sky-700">
                Security · audits
              </span>
              : third-party security audits and bug bounties (the{" "}
              <span className="font-mono text-xs">Audits</span> classification).
              Bounties also appear as milestones inside individual grants.
            </li>
          </ul>
        </Section>

        <Section title="Why the two “discretionary” figures differ">
          <p>
            The discretionary budget appears two ways, and the two numbers
            differ on purpose:
          </p>
          <ul className="mt-2 space-y-1.5">
            <li>
              The <span className="font-medium">ZCG operations</span> figure on
              the totals split (~$1.8M) comes from the{" "}
              <span className="font-medium">totals pivot</span>: the cumulative
              classification total published in the spreadsheet.
            </li>
            <li>
              The discretionary <span className="font-medium">budget tab</span>{" "}
              ($1M annual cap, ~$1.27M spent) is a separate annual worksheet.
            </li>
          </ul>
          <p className="mt-2">
            Two readings of the same programme at different scopes (cumulative
            pivot vs. annual budget). That is why the{" "}
            <Link href="/zcg/totals" className="text-amber-700 hover:underline">
              totals
            </Link>{" "}
            page shows a live ledger-vs-published cross-check instead of
            asserting they match.
          </p>
        </Section>

        <Section title="USD vs ZEC">
          <p>
            Budgeted USD includes paid and unpaid entries, including amounts
            recorded for cancelled grants. USD paid in the ledger-based views
            sums the budgeted value of entries marked paid, not their current
            market value. ZEC paid is the quantity recorded by the spreadsheet.
            USD and ZEC must not be added together. Treasury USD valuations use
            the available market price; historical entries retain their recorded
            rate.
          </p>
          <p className="mt-2">
            An approval is not a payment, and a recorded payment does not
            independently verify delivery or impact. Unpaid entries are not
            necessarily outstanding commitments: check their grant status and
            the original source.
          </p>
        </Section>

        <Section title="Reproduce it yourself">
          <p>
            Every number here is queryable. The read-only API exposes the same
            ledger, recipients and grant milestones this site renders. See{" "}
            <Link href="/api/zcg" className="text-amber-700 hover:underline">
              /api/zcg
            </Link>{" "}
            (JSON, or CSV via{" "}
            <span className="font-mono text-xs">?format=csv</span>
            ).
          </p>
        </Section>
      </>
      <Synced className="mt-6" />
    </>
  );
}
