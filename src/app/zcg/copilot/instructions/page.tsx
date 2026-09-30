import { ResearchGuide } from "@/components/copilot/research-guide";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const metadata = pageMetadata({
  title: "ZCG Copilot research guide · OpenZcash",
  description: "Read the complete ZCG Copilot instructions in your browser.",
  path: "/zcg/copilot/instructions",
});

export default function CopilotInstructionsPage() {
  return <ResearchGuide skill="zcg-copilot" />;
}
