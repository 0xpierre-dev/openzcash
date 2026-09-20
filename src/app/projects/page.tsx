import {
  SectionHeading,
  RecordLayout,
  RelatedLinks,
  Facts,
} from "@/components/workspace";
import { ProjectsAdmin } from "@/components/projects-admin";
import { PageHeader } from "@/components/ui";
import { getOnboardingPublicKey } from "@/lib/onboarding/seal";
import { listProjects } from "@/lib/projects/project-repo";

export const metadata = { title: "Projects · OpenZcash" };
export const dynamic = "force-dynamic";

export default async function ProjetosPage() {
  const projects = await listProjects();
  const publicKey = getOnboardingPublicKey();

  return (
    <>
      <PageHeader
        title="Recipient projects"
        subtitle="Each project submits a viewing key ONCE; the system derives a new address every month (all auditable from the same key). Pay each month's grant or bounty to that month's address: the project never resubmits an address."
      />
      <RecordLayout
        aside={
          <>
            <Facts
              title="How it works"
              rows={[
                ["Address model", "A derived address for each month"],
                ["Key registration", "Submitted once per project"],
                ["Access", "Read-only viewing key"],
              ]}
            />
            <RelatedLinks
              title="Workspace"
              links={[
                { href: "/viewing-keys", label: "Treasury sources" },
                { href: "/invites", label: "Onboarding invitations" },
              ]}
            />
          </>
        }
      >
        <SectionHeading
          title="Recipient project directory"
          description="Register and manage the viewing sources used by recipient projects."
        />
        <ProjectsAdmin projects={projects} publicKey={publicKey} />
      </RecordLayout>
    </>
  );
}
