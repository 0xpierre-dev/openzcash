import Link from "next/link";
import { Terminal } from "./terminal";
import { CopilotPage } from "@/components/copilot/copilot-page";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Coinholder Copilot · OpenZcash",
  description:
    "An agent skill for pre-vote diligence on the Coinholder-Directed Retroactive Grants Program: live, cited answers about the open round and every applicant's funding history.",
};

const USE_CASES = [
  {
    q: "Run diligence on proposal #21 before I vote.",
    a: "The ask, the claimed work, prior round verdicts, ledger history, announcement-vs-spreadsheet drift, and the open questions worth taking to the forum thread.",
  },
  {
    q: "Who in this round was funded before, and did they deliver?",
    a: "Every applicant cross-referenced against the audited ledger and prior rounds: funded-and-delivered, rejected-before, two-track orgs, first-timers.",
  },
  {
    q: "How does the ballot actually work?",
    a: "Four options, two of which are 'no' votes with different signals. Plus the keyholder veto that already zeroed out a coinholder-approved $2.67M grant.",
  },
  {
    q: "What has the Coinholder program actually paid so far?",
    a: "The completed grants and their per-payment ZEC trail, kept distinct from the $9M currently being requested.",
  },
];

const SOURCES = [
  {
    name: "Round mirror",
    desc: "The open review round (proposals, asks, key dates, ballot options), curated from FPF's announcement, which runs ahead of the spreadsheet.",
  },
  {
    name: "OpenZcash ledger",
    desc: "Audited mirror of the official ZCG spreadsheet. What was actually paid, to whom, across both programs.",
  },
  {
    name: "Prior rounds",
    desc: "The Coinholder proposals tab: rejections, withdrawals and late submissions that never reach the ledger.",
  },
  {
    name: "FPF GitHub + forum",
    desc: "The application texts with their evidence links, and the community debate in each proposal's thread.",
  },
];

export default function CoinholderCopilotPage() {
  return (
    <CopilotPage
      title="Coinholder Copilot"
      subtitle="Research applications, evidence and funding history before voting."
      skill="coinholder-copilot"
      intro={
        <>
          Retroactive grants ask you to judge work already done. This skill
          turns your coding agent into a diligence copilot for the review
          round: every applicant cross-referenced against the audited payment
          ledger, prior round verdicts, and their own submitted evidence. Every
          figure is cited, never recalled from the model&apos;s memory.
        </>
      }
      examples={USE_CASES}
      sources={SOURCES}
      note={
        <>
          The skill also encodes the round&apos;s real traps: repeat submissions
          at higher asks, same-org multiple proposals, third-party bonus
          nominations, announcement-vs-spreadsheet drift, and the difference
          between coinholder approval and actual payment. It lays out the
          evidence and never tells you how to vote. Methodology:{" "}
          <Link href="/zcg/methodology">how we compute this</Link>.
        </>
      }
      terminal={<Terminal />}
    />
  );
}
