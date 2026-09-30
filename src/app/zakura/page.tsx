import { OrgPage } from "@/components/org-page";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { organizationDescription } from "@/lib/ecosystem/data";

export const metadata = pageMetadata({
  title: "Zakura · OpenZcash",
  description: organizationDescription("zakura"),
  path: "/zakura",
});

export default function ZakuraPage() {
  return <OrgPage orgId="zakura" logo="/logos/ecosystem/zakura.png" />;
}
