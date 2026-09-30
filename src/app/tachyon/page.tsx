import { OrgPage } from "@/components/org-page";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { organizationDescription } from "@/lib/ecosystem/data";

export const metadata = pageMetadata({
  title: "Tachyon · OpenZcash",
  description: organizationDescription("project-tachyon"),
  path: "/tachyon",
});

export default function TachyonPage() {
  return <OrgPage orgId="project-tachyon" logo="/logos/ecosystem/tachyon.png" />;
}
