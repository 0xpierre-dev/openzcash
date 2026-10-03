import { displayDate, safeExternalUrl } from "@/lib/ecosystem/catalog";
import type { Source } from "@/lib/project-history/types";
import styles from "./history.module.css";

export function SourceLink({ source }: { source: Source }) {
  const url = safeExternalUrl(source.url);
  return url ? <a className={styles.source} href={url} title={source.observedAt ? `Source observed ${displayDate(source.observedAt)}` : undefined} target="_blank" rel="noopener noreferrer">{source.label} ↗</a> : <span className={styles.muted}>Source unavailable</span>;
}
