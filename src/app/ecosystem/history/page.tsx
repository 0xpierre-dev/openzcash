import Link from "next/link";
import { HistoryDirectory } from "@/components/project-history/directory";
import { projectHistoryDirectory } from "@/lib/project-history/data";
import styles from "@/components/project-history/history.module.css";

export const metadata = { title: "Project history · OpenZcash", description: "Follow funding, milestones, published work and evidence gaps across Zcash projects and communities." };
export default function HistoryPage() {
  const items = projectHistoryDirectory().map(({ id, name, description, category }) => ({ id, name, description, category }));
  return <main className={styles.page}>
    <Link className={styles.back} href="/ecosystem">← Ecosystem</Link>
    <header className={styles.hero}><div><div className={styles.eyebrow}>OpenZcash / evidence over time</div><h1>Project history.</h1><p>Follow the funding, the work and the evidence.<br />A shared record for projects, communities and the people supporting them.</p></div><Link className={styles.action} href="/zarvis">Ask Zarvis ↗</Link></header>
    <HistoryDirectory items={items} />
  </main>;
}
