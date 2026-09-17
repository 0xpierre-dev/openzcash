import { EditorialIntro, RelatedLinks } from "@/components/workspace";
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
      <EditorialIntro
        eyebrow="Governance"
        title="Five seats. Public decisions."
        description="Meet the current members, inspect their public roles and follow their recorded connections to the ecosystem."
      >
        <RelatedLinks
          links={[
            { href: "/zcg/meetings", label: "Committee meetings" },
            { href: "/zcg/stipends", label: "Compensation history" },
            { href: "/zcg/proposals", label: "Proposal decisions" },
          ]}
        />
      </EditorialIntro>
      <CurrentCommittee />
      <ElectionsSection />
    </>
  );
}
