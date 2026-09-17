import { PageHeader } from "@/components/ui";
import { Terminal } from "./terminal";
import { AddToAgent } from "../../zcg/copilot/add-to-agent";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "ZecHub Copilot · OpenZcash",
  description:
    "An agent skill for the ZecHub DAO: live, cited answers about proposals, votes, members and the treasury, plus the rule that actually decides a vote.",
};

const USE_CASES = [
  {
    q: "Did proposal A116 pass? It had twice as many yes as no.",
    a: "No. It computes both tests and shows which one failed: 66.67% approval against a 67% bar. A yes-majority is not enough, and 25 proposals have died that way.",
  },
  {
    q: "What is ZecHub voting on right now?",
    a: "Every open proposal with its tally, turnout, and what it still needs: more votes for quorum, or more yes for the 67% bar.",
  },
  {
    q: "How much can ZecHub actually spend?",
    a: "The spendable balance, not the headline total. Three separate pots, and the biggest one is donations rather than working capital.",
  },
  {
    q: "What has ZecHub paid contributors?",
    a: "The payout table reconciled against the dashboard total. They differ by $5,200 because one is per-period and the other cumulative.",
  },
];

const SOURCES = [
  {
    name: "DAO indexer",
    desc: "Proposals, votes, and members straight from the ZecHub DAO on Juno: 173 proposals of history, each vote attributable.",
  },
  {
    name: "Juno LCD",
    desc: "What a proposal actually executes on-chain. Membership changes are invisible without it: the indexer returns no messages.",
  },
  {
    name: "Treasury mirror",
    desc: "The three pots, allocations and payouts, refreshed on a 6h cycle with the ZEC price used at snapshot time.",
  },
  {
    name: "ZCG ledger",
    desc: "The other direction of the money: what Zcash Community Grants has paid ZecHub itself.",
  },
];

export default function ZechubCopilotPage() {
  return (
    <div className="ws-copilot">
      <PageHeader
        title="ZecHub Copilot"
        subtitle="Explore DAO votes, treasury records and governance thresholds."
      />

      <section className="ws-copilot-hero">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.35em] text-amber-700">
            An agent skill for the ZecHub DAO
          </p>
          <h2 className="ws-copilot-title">
            More yes than no
            <br />
            is not a win.
          </h2>
          <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-stone-600">
            ZecHub decides its funding on-chain, and the rule is stricter than
            it looks: a proposal needs 67% of yes+no <em>and</em> 40% turnout.
            This skill turns your coding agent into a copilot that computes both
            tests from the live indexer, names every voter, and reads the
            treasury without falling into its traps. Every figure comes with a
            citation.
          </p>
          <div className="ws-install-command">
            <code className="font-mono text-sm text-emerald-400">
              npx skills add Michae2xl/openzcash --skill zechub-copilot
            </code>
          </div>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-stone-400">
            BYO-LLM · no key · no hosted service
          </p>
          <div className="mt-8">
            <AddToAgent skill="zechub-copilot" />
          </div>
        </div>
        <Terminal />
      </section>

      <section className="mt-16">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.3em] text-stone-400">
          Ask things like
        </p>
        <div className="ws-prompt-grid">
          {USE_CASES.map((u) => (
            <div
              key={u.q}
              className="bg-white p-6 transition-colors hover:bg-stone-50"
            >
              <p className="font-mono text-[13px] leading-relaxed text-stone-900">
                <span className="mr-1.5 text-amber-600">❯</span>
                {u.q}
              </p>
              <p className="mt-2.5 text-xs leading-relaxed text-stone-500">
                {u.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.3em] text-stone-400">
          Grounded in four public sources
        </p>
        <div className="ws-source-grid">
          {SOURCES.map((s) => (
            <div key={s.name} className="bg-white p-6">
              <p className="font-mono text-[13px] font-semibold text-stone-900">
                {s.name}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-stone-500">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-stone-400">
          The skill encodes the traps that produce wrong answers: abstentions
          that carry quorum without diluting the threshold, <code>closed</code>{" "}
          and <code>rejected</code> both meaning defeat, milestones marked
          complete next to money still pending, a member count that is
          snapshotted per proposal, and the difference between what the DAO
          holds on-chain and what ZecHub can actually spend. It is read-only and
          never submits or votes.
        </p>
      </section>
    </div>
  );
}
