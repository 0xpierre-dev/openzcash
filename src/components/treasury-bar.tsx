import Link from "next/link";
import { getTreasurySummary } from "@/lib/zcash/treasury-summary";

/**
 * The two treasuries, pinned to the bottom of every shell page. Server
 * component streamed into the client shell through a Suspense boundary, so
 * a slow price or chain source never delays the page itself.
 */
export async function TreasuryBar() {
  const t = await getTreasurySummary();
  if (!t || (!t.operating && !t.lockbox)) return null;
  const pools = [t.operating, t.lockbox].filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );
  return (
    <div className="rd-treasury-inner">
      {pools.map((p) => (
        <Link key={p.name} href={p.href} className="rd-treasury-pool">
          <span className="rd-treasury-name">{p.name}</span>
          <span className="rd-treasury-zec tnum">
            {p.zec} <small>ZEC</small>
          </span>
          <span className="rd-treasury-usd tnum">
            ≈ {p.usd}
            {p.sub ? ` · ${p.sub}` : ""}
          </span>
        </Link>
      ))}
      <div className="rd-treasury-right">
        <span className="rd-treasury-meta tnum">
          {t.height ? `block ${t.height}` : ""}
          {t.height && t.price ? " · " : ""}
          {t.price ? `ZEC ${t.price}` : ""}
        </span>
        <Link href="/treasury" className="rd-treasury-link">
          Treasury at a glance →
        </Link>
      </div>
    </div>
  );
}
