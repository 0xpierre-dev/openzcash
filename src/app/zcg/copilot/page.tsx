import Link from "next/link";
import { Terminal } from "./terminal";
import { CopilotPage } from "@/components/copilot/copilot-page";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "ZCG Copilot · OpenZcash",
  description:
    "An agent skill that turns your coding agent into a ZCG grants copilot: live, cited answers about Zcash Community Grants funding.",
};

const USE_CASES = [
  {
    q: "I want to build privacy-preserving payments on Zcash. Vet this idea.",
    a: "What was funded in that space with exact paid totals, what was declined, and what is pending review right now.",
  },
  {
    q: "I'm applying for a wallet grant. Who got funded before, and how much?",
    a: "Every wallet grant in the ledger: grantee, budget, milestones paid, dates.",
  },
  {
    q: "What's ZCG's burn rate this year, month by month?",
    a: "Aggregated from the payment ledger CSV, split by program, spikes explained line by line.",
  },
  {
    q: "How much has ZCG paid to QEDIT in total?",
    a: "Budgeted vs actually paid, across how many grants and payments.",
  },
];

const SOURCES = [
  {
    name: "OpenZcash ledger",
    desc: "Audited mirror of the official ZCG spreadsheet. Payments, recipients, grants. JSON and CSV.",
  },
  {
    name: "Live pipeline",
    desc: "Proposals under review right now, straight from the ZCG issue tracker.",
  },
  {
    name: "Canonical records",
    desc: "Requested vs approved amounts from a committee member's grants prototype (zcg.pgpz.org). The Grant Dashboard spreadsheet stays the source of truth.",
  },
  {
    name: "GitHub + forum",
    desc: "Full application texts, labels, and the community debate around each proposal.",
  },
];

export default function ZcgCopilotPage() {
  return (
    <CopilotPage
      title="ZCG Copilot"
      subtitle="Source-backed research for Zcash grants and public spending."
      skill="zcg-copilot"
      intro={
        <>
          A skill that turns your coding agent into a ZCG grants copilot. Ask
          about grants, spending, recipients, and proposals under review.
          Answers come from the live public ledger, GitHub, and the forum, with
          a citation on every figure, never from the model&apos;s memory.
        </>
      }
      examples={USE_CASES}
      sources={SOURCES}
      note={
        <>
          The skill also encodes the data&apos;s real failure modes: same-title
          collisions between re-applications, requested vs paid confusion,
          milestone double counting. Methodology:{" "}
          <Link href="/zcg/methodology">how we compute this</Link>.
        </>
      }
      terminal={<Terminal />}
    />
  );
}
