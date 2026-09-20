import { Terminal } from "./terminal";
import { CopilotPage } from "@/components/copilot/copilot-page";

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

export default function ZecHubCopilotPage() {
  return (
    <CopilotPage
      title="ZecHub Copilot"
      subtitle="Explore DAO votes, treasury records and governance thresholds."
      skill="zechub-copilot"
      intro={
        <>
          ZecHub decides its funding on-chain, and the rule is stricter than it
          looks: a proposal needs 67% of yes+no <em>and</em> 40% turnout. This
          skill turns your coding agent into a copilot that computes both tests
          from the live indexer, names every voter, and reads the treasury
          without falling into its traps. Every figure comes with a citation.
        </>
      }
      examples={USE_CASES}
      sources={SOURCES}
      note={
        <>
          The skill encodes the traps that produce wrong answers: abstentions
          that carry quorum without diluting the threshold, <code>closed</code>{" "}
          and <code>rejected</code> both meaning defeat, milestones marked
          complete next to money still pending, a member count that is
          snapshotted per proposal, and the difference between what the DAO
          holds on-chain and what ZecHub can actually spend. It is read-only and
          never submits or votes.
        </>
      }
      terminal={<Terminal />}
    />
  );
}
