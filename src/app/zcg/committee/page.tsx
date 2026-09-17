import { PageHeader } from "@/components/ui";
import { CurrentCommittee } from "../current-committee";
import { ElectionsSection } from "../elections-section";
export const dynamic = "force-dynamic";
export const metadata = { title: "ZCG Committee · OpenZcash" };
export default function CommitteePage() {
  return (
    <>
      <PageHeader
        title="The ZCG committee"
        subtitle="Current members, their terms and source-linked public roles. Grant relationships come from the same official ledger used throughout OpenZcash."
      />
      <CurrentCommittee />
      <ElectionsSection />
    </>
  );
}
