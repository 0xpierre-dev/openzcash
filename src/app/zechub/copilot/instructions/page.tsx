import { ResearchGuide } from "@/components/copilot/research-guide";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const metadata = pageMetadata({
  title: "ZecHub Copilot research guide · OpenZcash",
  description: "Read the complete ZecHub Copilot instructions in your browser.",
  path: "/zechub/copilot/instructions",
});

export default function CopilotInstructionsPage() {
  return <ResearchGuide skill="zechub-copilot" />;
}
