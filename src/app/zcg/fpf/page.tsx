
import { Card, Stat } from "@/components/ui";
import { OrgHeader } from "@/components/org-header";
import { listGrants } from "@/lib/zcg/grants-repo";
import { listProposals, proposalsFunnel } from "@/lib/zcg/proposals-repo";
import { getLinks } from "@/lib/zcg/governance-repo";
import { formatUsdCents } from "@/lib/zcg/format";
import {
  FpfGrantsTable,
  FpfProposalsTable,
  type GrantTableRow,
  type ProposalTableRow,
} from "./fpf-tables";
import { cached, LEDGER_TTL_MS } from "@/lib/cache/memo";
import { publicationDay } from "@/lib/zcg/publication-policy";
import {
  COINHOLDER_VERDICT_LABEL,
  grantStatusLabel as sharedGrantStatusLabel,
} from "@/lib/zcg/status-labels";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "FPF · Coinholder Grants · OpenZcash",
};

// Shared vocabularies; the coinholder programme keeps its own verdict wording.
const PROPOSAL_VERDICT_LABEL = COINHOLDER_VERDICT_LABEL;

function grantStatusLabel(status: string | null): string {
  return sharedGrantStatusLabel(status, "·");
}

export default async function FpfCoinholderGrantsPage() {
  const [grants, proposals, funnel, links] = await Promise.all([
    cached("listGrants:coinholder", LEDGER_TTL_MS, () =>
      listGrants({ program: "coinholder" }),
    ),
    cached(`listProposals:coinholder:${publicationDay()}`, LEDGER_TTL_MS, () =>
      listProposals({ program: "coinholder" }),
    ),
    cached(`proposalsFunnel:${publicationDay()}`, LEDGER_TTL_MS, () =>
      proposalsFunnel(),
    ),
    cached("links", LEDGER_TTL_MS, () => getLinks()),
  ]);
  const proposalFpf = links.proposal_fpf ?? "#";
  const cryptpadMilestone = links.cryptpad_milestone ?? "#";

  // Paid USD restricted to the coinholder grants shown here.
  const coinholderPaidCents = grants.reduce((acc, g) => acc + g.usdCents, 0n);
  const coinholderProposalCount =
    funnel.byProgram.find((p) => p.program === "coinholder")?.count ??
    proposals.length;

  const grantRows: GrantTableRow[] = grants.map((g) => ({
    grantKey: g.grantKey,
    grantee: g.grantee,
    category: g.category ?? "·",
    status: g.status,
    statusLabel: grantStatusLabel(g.status),
    _usd: Number(g.usdCents),
  }));

  const proposalRows: ProposalTableRow[] = proposals.map((p) => ({
    id: p.id,
    title: p.title,
    applicant: p.applicantsRaw ?? "·",
    status: p.status,
    verdictLabel: PROPOSAL_VERDICT_LABEL[p.status] ?? p.status,
    platformLink: p.platformLink,
    _usd: p.requestedUsdCents == null ? 0 : Number(p.requestedUsdCents),
  }));

  return (
    <>
      <OrgHeader
        name="Financial Privacy Foundation"
        logo="/logos/fpf.png"
        tagline="Retroactive grants directed by coinholder vote, not by a committee. Run by the Financial Privacy Foundation on a quarterly cadence."
        links={[
          { href: proposalFpf, label: "Submit a proposal" },
          { href: cryptpadMilestone, label: "Submit a milestone" },
        ]}
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat
          label="Grants"
          value={String(grants.length)}
          sub="coinholder directed"
        />
        <Stat
          label="Total paid"
          value={formatUsdCents(coinholderPaidCents, { compact: true })}
          sub="USD across coinholder grants"
        />
        <Stat
          label="Proposals"
          value={String(coinholderProposalCount)}
          sub="submitted to the program"
          tone="warn"
        />
      </section>

      <>
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">
            Coinholder grants
          </h2>
          <Card className="p-0 overflow-hidden">
            <FpfGrantsTable grantRows={grantRows} />
          </Card>
          <p className="mt-3 text-xs text-stone-600">
            {grants.length} grants · one approved project per row · amounts in
            USD with ZEC equivalents tracked in the ledger.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-stone-700">
            Coinholder proposals
          </h2>
          <Card className="p-0 overflow-hidden">
            <FpfProposalsTable proposalRows={proposalRows} />
          </Card>
          <p className="mt-3 text-xs text-stone-600">
            {proposals.length} proposals · the pipeline upstream of the grants
            above · only approved proposals become paid grants.
          </p>
        </section>
      </>
    </>
  );
}
