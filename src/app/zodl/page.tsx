import { OrgPage } from "@/components/org-page";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { organizationDescription } from "@/lib/ecosystem/data";

export const metadata = pageMetadata({
  title: "ZODL · OpenZcash",
  description: organizationDescription("zodl"),
  path: "/zodl",
});

export default function ZODLPage() {
  return <OrgPage orgId="zodl" logo="/logos/ecosystem/zodl-lab.png" />;
}
