import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { DESIGN_GROUPS } from "@/lib/design-routes";
export const metadata = { title: "Explore the redesign · OpenZcash" };
export default function DesignReviewPage() {
  return (
    <>
      <PageHeader
        title="A clearer view of Zcash."
        subtitle="Explore the new screens using the application’s real records. Follow a grant, compare payments, browse the ecosystem, or open the office."
      />
      <div className="rd-review-grid">
        {DESIGN_GROUPS.map((group) => (
          <section className="rd-review-group" key={group.name}>
            <h2>{group.name}</h2>
            <p>{group.description}</p>
            {group.routes.map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
                <span aria-hidden>↗</span>
              </Link>
            ))}
          </section>
        ))}
      </div>
      <section className="rd-preserved">
        <h2>Familiar, by design</h2>
        <p>
          <Link href="/">
            The home page, app launcher and both treasury cards ↗
          </Link>{" "}
          keep their current layout.{" "}
          <Link href="/monthly">Monthly and its editions ↗</Link> keep the
          existing publication format. The{" "}
          <Link href="/zcg/office">3D office ↗</Link> has a new entrance; the
          room stays the same. Grant and recipient details open from their
          respective lists. The existing Maya route continues to redirect to
          reconciliation.
        </p>
      </section>
    </>
  );
}
