import type { ReactNode } from "react";
import styles from "./coinholders.module.css";

/** One cell of a stat strip: label, a figure centred in its cell (with an optional smaller unit), and a sub-line. */
export function Stat({
  label,
  value,
  unit,
  sub,
  as: Tag = "div",
}: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  as?: "div" | "li";
}) {
  return (
    <Tag className={styles.stat}>
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.statValue}>
        {value}
        {unit ? <span className={styles.statUnit}>{unit}</span> : null}
      </p>
      {sub ? <p className={styles.statSub}>{sub}</p> : null}
    </Tag>
  );
}
