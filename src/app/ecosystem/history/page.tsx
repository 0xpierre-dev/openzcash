import Link from "next/link";
import { HistoryDirectory } from "@/components/project-history/directory";
import { readHistoryIndex } from "@/lib/project-history/data";
import { displayDate } from "@/lib/ecosystem/catalog";
import styles from "@/components/project-history/history.module.css";

export const metadata = { title: "Project history · OpenZcash", description: "Follow funding, milestones, published work and evidence gaps across Zcash projects and communities." };
export const dynamic = "force-dynamic";
export default async function HistoryPage() {
  const index = await readHistoryIndex();
  return <div className={styles.page}>
    <Link className={styles.back} href="/ecosystem">← Ecosystem</Link>
    <header className={styles.hero}><div><div className={styles.eyebrow}>OpenZcash / evidence over time</div><h1>Follow the work.</h1><p>Funding, published work and what still needs evidence.<br />Explore the record behind each project and community.</p></div><div className={styles.actions}><Link className={styles.action} href="/zcg/grants">Grant ledger →</Link><Link className={styles.primary} href="/zarvis">Ask Zarvis ↗</Link></div></header>
    <div className={styles.freshness}><span>Repository snapshot <b>{displayDate(index.repositorySnapshotAt)}</b></span><span>Latest ledger import <b>{index.ledgerImportedAt ? displayDate(index.ledgerImportedAt) : "unavailable"}</b></span><span>No cross-project funding total · shared grants may overlap</span></div>
    {(!index.coverage.proposalsAvailable || !index.coverage.paymentsAvailable) && <p className={styles.notice} role="status">Financial coverage is incomplete. Unavailable payments appear as “—”; dated grant references remain visible.</p>}
    <HistoryDirectory items={index.items} />
  </div>;
}
