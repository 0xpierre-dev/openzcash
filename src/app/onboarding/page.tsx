import {
  SectionHeading,
  RecordLayout,
  RelatedLinks,
  Facts,
} from "@/components/workspace";
import { OnboardingForm } from "@/components/onboarding-form";
import { PageHeader } from "@/components/ui";
import { getOnboardingPublicKey } from "@/lib/onboarding/seal";

export const metadata = { title: "Register treasury · OpenZcash" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const publicKey = getOnboardingPublicKey();

  return (
    <>
      <PageHeader
        title="Register treasury"
        subtitle="Upload a viewing key (shielded, encrypted in your browser) or a transparent address (public). The system fetches and updates automatically: read-only auditing, never holding spend keys."
      />
      <RecordLayout
        aside={
          <>
            <Facts
              title="How it works"
              rows={[
                ["Access", "Read-only auditing"],
                ["Shielded source", "Viewing key encrypted in your browser"],
                ["Transparent source", "Public address"],
              ]}
            />
            <RelatedLinks
              title="Workspace"
              links={[
                { href: "/viewing-keys", label: "Treasury workspace" },
                { href: "/zcg/methodology", label: "How the data is used" },
              ]}
            />
          </>
        }
      >
        <SectionHeading
          title="Connect a treasury"
          description="Choose the source to register, then review its scope before submitting."
        />
        <OnboardingForm publicKey={publicKey} token={token ?? null} />
      </RecordLayout>
    </>
  );
}
