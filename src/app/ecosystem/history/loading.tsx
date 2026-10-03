import styles from "@/components/project-history/history.module.css";
export default function Loading() {
  return <main className={styles.page} aria-busy="true"><p className={styles.eyebrow}>Project history</p><p>Reading the linked source records…</p></main>;
}
