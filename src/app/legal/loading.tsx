import styles from "@/components/legal/legal.module.css";

export default function LoadingLegal() {
  return <div className={styles.page} aria-busy="true"><header className={styles.hero}><div><div className={styles.kicker}>PRIVACY · POLICY · RIGHTS</div><h1>Zcash Legal</h1><p role="status">Loading public updates…</p></div></header></div>;
}
