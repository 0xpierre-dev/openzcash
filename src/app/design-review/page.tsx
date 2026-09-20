import Link from "next/link";
import { EditorialIntro } from "@/components/workspace";
import { PageHeader } from "@/components/ui";
import { DESIGN_GROUPS } from "@/lib/design-routes";
import { getIsAdmin } from "@/lib/auth/admin";
export const dynamic = "force-dynamic";
export const metadata = { title: "Explore the redesign · OpenZcash" };
export default async function DesignReviewPage() {
  // Management pages are only offered to a signed-in administrator, as in the
  // app directory; anonymous reviewers see the public workspace.
  const isAdmin = await getIsAdmin();
  const groups = DESIGN_GROUPS.filter((g) => g.name !== "Manage" || isAdmin);
  return (
    <>
      <PageHeader
        title="A clearer view of Zcash."
        subtitle="Explore the new screens using the application’s real records. Follow a grant, compare payments, browse the ecosystem, or open the office."
      />
      <EditorialIntro
        eyebrow="Your OpenZcash workspace"
        title="Start with a question. Follow the records."
        description="The redesigned pages are connected to the system's data and tools. Choose an area below to explore funding, governance, development and the wider ecosystem."
      >
        <div className="ws-quick-links">
          <Link href="/zcg/grants">Explore grants →</Link>
          <Link href="/zcg/schedule">Upcoming payments →</Link>
          <Link href="/ecosystem">Browse the ecosystem →</Link>
        </div>
      </EditorialIntro>
      <div className="rd-review-grid">
        {groups.map((group) => (
          <section className="rd-review-group" key={group.name}>
            <h2>{group.name}</h2>
            <p>{group.description}</p>
            {group.routes.map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
                <span aria-hidden>→</span>
              </Link>
            ))}
          </section>
        ))}
      </div>
      <section className="rd-preserved">
        <h2>Familiar, by design</h2>
        <p>
          <Link href="/">The home page →</Link> now lives inside the shell:
          the two treasuries at a glance, then the app launcher, and both
          treasuries stay pinned to the bottom of every page.{" "}
          <Link href="/monthly">Monthly and its editions →</Link> keep the
          existing publication format. The{" "}
          <Link href="/zcg/office">3D office →</Link> has a new entrance; the
          room stays the same. Grant and recipient details open from their
          respective lists. The existing Maya route continues to redirect to
          DeFi.
        </p>
      </section>
    </>
  );
}
