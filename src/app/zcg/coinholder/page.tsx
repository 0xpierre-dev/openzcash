import { RecordLayout, RelatedLinks, SectionHeading, SourceNote } from "@/components/workspace";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { formatUsdCents } from "@/lib/zcg/format";
import { COINHOLDER_ROUND, ROUND_BANDS } from "@/lib/zcg/coinholder-round";
import { RoundProposalsTable } from "./round-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coinholder Grants · OpenZcash" };

export default function CoinholderPage() {
  const [reviewCloseDay, reviewCloseTime] = COINHOLDER_ROUND.reviewCloses.split(" · ");
  return (
    <>
      <PageHeader
        title="Coinholder Grants"
        subtitle="The FPF-run retroactive grants round: the proposals under review, what each one asks for, and the ballot coinholders vote on. The pool that pays them has its own page."
        actions={<Badge tone="amber">{COINHOLDER_ROUND.label} · in review</Badge>}
      />

      <section className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Proposals"
          value={String(COINHOLDER_ROUND.proposalCount)}
          sub={`${COINHOLDER_ROUND.label} round · announced ${COINHOLDER_ROUND.announcedOn}`}
        />
        <Stat
          label="Requested"
          value={formatUsdCents(COINHOLDER_ROUND.totalRequestedUsdCents, { compact: true })}
          sub="all proposals, USD"
          tone="warn"
        />
        <Stat label="Review closes" value={reviewCloseDay} sub={reviewCloseTime ?? "UTC"} />
        <Stat
          label="Coinholder poll opens"
          value={COINHOLDER_ROUND.pollOpens}
          sub="after the review closes"
        />
      </section>

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {ROUND_BANDS.map((b) => (
          <Stat
            key={b.key}
            label={b.label}
            value={String(b.count)}
            sub={`${b.count === 1 ? "proposal" : "proposals"} · ${formatUsdCents(b.totalUsdCents, { compact: true })} · ${b.sharePct}% of the ask`}
          />
        ))}
      </section>

      <RecordLayout
        aside={
          <RelatedLinks
            links={[
              {
                href: COINHOLDER_ROUND.sourceThreadUrl,
                label: "FPF announcement",
                description: "The round as announced on the forum",
              },
              {
                href: COINHOLDER_ROUND.githubRepoUrl,
                label: "GitHub submissions",
                description: "Evidence for each proposal",
              },
              {
                href: COINHOLDER_ROUND.dataDocUrl,
                label: "Full data doc",
                description: "Everything in one document for your own LLM",
              },
              {
                href: "/zcg/coinholder/copilot",
                label: "Coinholder Copilot",
                description: "Research applicants before voting",
              },
              {
                href: "/zcg/coinholder/pool",
                label: "Coinholder pool",
                description: "Balances and funding history",
              },
            ]}
          />
        }
      >
        <SectionHeading
          title="Proposals under review"
          count={COINHOLDER_ROUND.proposalCount}
          description="Every proposal in the round with its organisation, size band and requested amount. Curated from the FPF announcement, which runs ahead of the public sheet while submissions are still being logged."
        />
        <Card className="p-4">
          <RoundProposalsTable />
        </Card>
        <SourceNote>
          Ballot options: {COINHOLDER_ROUND.ballotOptions.join(" · ")}. Both
          reject options tally as “no” votes; the lower-amount option only
          signals that the requested amount was the blocker. Grants already paid
          from the pool are on the pool page, not in this round.
        </SourceNote>
      </RecordLayout>
    </>
  );
}
