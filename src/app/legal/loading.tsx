import { IconBalance } from "@/components/icons";
import styles from "@/components/legal/legal.module.css";

export default function LoadingLegal() {
  return <div className={styles.page} aria-busy="true"><header className={styles.hero}><div><h1 className={styles.kicker}><IconBalance/>PRIVACY · POLICY · RIGHTS</h1><p role="status">Loading public updates…</p></div></header></div>;
}
