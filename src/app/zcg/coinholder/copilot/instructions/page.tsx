import { ResearchGuide } from "@/components/copilot/research-guide";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const metadata = pageMetadata({
  title: "Coinholder Copilot research guide · OpenZcash",
  description: "Read the complete Coinholder Copilot instructions in your browser.",
  path: "/zcg/coinholder/copilot/instructions",
  card: { section: "Coinholder Grants" },
});

export default function CopilotInstructionsPage() {
  return <ResearchGuide skill="coinholder-copilot" />;
}
