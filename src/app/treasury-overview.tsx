import Link from "next/link";
import {
  getTreasurySummary,
  type TreasuryPool,
} from "@/lib/zcash/treasury-summary";

/**
 * "Treasury at a glance" for the home page: the two pools the ZCG spreadsheet
 * tracks, read from the same cached projection as the shell's treasury bar.
 */

function PoolCard({ pool }: { pool: TreasuryPool }) {
  return (
    <Link
      href={pool.href}
      className="oz-card oz-pool block rounded-2xl border border-stone-200 bg-white p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-stone-600">
          {pool.name}
        </p>
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-500/20">
          {pool.tag}
        </span>
      </div>
      <p className="num-lg mt-2 break-words text-2xl tracking-tight text-stone-900 tnum sm:text-3xl">
        {pool.zec}
        <span className="ml-1.5 text-base font-medium text-stone-600">ZEC</span>
      </p>
      <p className="mt-1 text-sm text-stone-600 tnum">
        ≈ {pool.usd}
        {pool.sub ? <span> · {pool.sub}</span> : null}
      </p>
    </Link>
  );
}

export async function TreasuryOverview() {
  const t = await getTreasurySummary();
  if (!t || (!t.operating && !t.lockbox)) return null;

  return (
    <section className="oz-treasury mt-2">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-stone-700">
          Treasury at a glance
        </h2>
        <p className="text-xs text-stone-600 tnum">
          {t.height ? `block ${t.height}` : null}
          {t.price ? ` · ZEC ${t.price}` : null}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {t.operating ? <PoolCard pool={t.operating} /> : null}
        {t.lockbox ? <PoolCard pool={t.lockbox} /> : null}
      </div>
    </section>
  );
}
