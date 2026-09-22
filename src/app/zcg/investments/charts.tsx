"use client";

import { useId, useState } from "react";
import type { VolumeMonth } from "@/lib/defi/maya-activity-model";
import { volumeSeries } from "@/lib/defi/maya-activity-model";
import type { MayaPosition } from "@/lib/defi/maya-position";
import styles from "./investments.module.css";

const number = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const usd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
const compact = (n: number) =>
  n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
const monthLabel = (month: string) =>
  new Date(month + "-01T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

type Point = {
  month: string;
  value: number;
  detail: string;
  partial?: boolean;
};

/** Real buttons give every chart point keyboard and touch access. The SVG is
 * visual only; the same values are also available in an ordinary data table. */
function SeriesChart({
  points,
  line,
  unit,
  label,
  totalLabel,
  total,
}: {
  points: Point[];
  line?: boolean;
  unit: "USD" | "CACAO";
  label: string;
  totalLabel: string;
  total: number;
}) {
  const id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const active = points.find((p) => p.month === selected);
  const format = unit === "USD" ? usd : (v: number) => `${number(v)} CACAO`;
  if (!points.length)
    return <p className={styles.empty}>No monthly data is available.</p>;
  const low = Math.min(0, ...points.map((p) => p.value));
  const high = Math.max(0, ...points.map((p) => p.value));
  const niceCeiling = (n: number) => {
    const magnitude = 10 ** Math.floor(Math.log10(n || 1));
    return Math.ceil(n / magnitude) * magnitude;
  };
  const top = niceCeiling(high * 1.04) || 1;
  const bottom = low < 0 ? -niceCeiling(-low * 1.04) : 0;
  const y = (v: number) => 200 - ((v - bottom) / (top - bottom)) * 200;
  const x = (i: number) => ((i + 0.5) / points.length) * 800;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`)
    .join(" ");
  const area = `${path} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const tickStep = Math.max(1, Math.ceil(points.length / 5));

  return (
    <div className={styles.series}>
      <div
        className={styles.chartReadout}
        aria-live="polite"
        aria-atomic="true"
      >
        <span>
          {active
            ? `${monthLabel(active.month)}${active.partial ? " · partial month" : ""}`
            : totalLabel}
        </span>
        <strong>{format(active?.value ?? total)}</strong>
        <small>
          {active
            ? active.detail
            : line
              ? "Cumulative volume since the pool's first activity"
              : "Select a month to inspect its value"}
        </small>
      </div>
      <div className={styles.chartFrame}>
        <div className={styles.yAxis} aria-hidden="true">
          {[top, (top + bottom) / 2, bottom].map((v, i) => (
            <span key={i}>
              {unit === "USD" ? "$" : ""}
              {compact(v)}
            </span>
          ))}
        </div>
        <div className={styles.plot}>
          <svg
            className={styles.chartSvg}
            viewBox="0 0 800 200"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity=".20" />
                <stop
                  offset="100%"
                  stopColor="var(--accent)"
                  stopOpacity=".01"
                />
              </linearGradient>
            </defs>
            {[0, 100, 200].map((v) => (
              <line
                key={v}
                x1="0"
                x2="800"
                y1={v}
                y2={v}
                className={styles.gridLine}
              />
            ))}
            {low < 0 && (
              <line
                x1="0"
                x2="800"
                y1={y(0)}
                y2={y(0)}
                className={styles.zeroLine}
              />
            )}
            {line ? (
              <>
                <path d={area} fill={`url(#${id})`} />
                <path
                  d={path}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
                {active && (
                  <circle
                    cx={x(points.indexOf(active))}
                    cy={y(active.value)}
                    r="4"
                    fill="var(--accent)"
                  />
                )}
              </>
            ) : (
              points.map((p, i) => (
                <rect
                  key={p.month}
                  x={x(i) - (800 / points.length) * 0.32}
                  y={Math.min(y(0), y(p.value))}
                  width={(800 / points.length) * 0.64}
                  height={Math.abs(y(p.value) - y(0))}
                  rx="2"
                  fill={p.value < 0 ? "var(--neg)" : "var(--accent)"}
                  opacity={
                    p.partial
                      ? 0.35
                      : !active || active.month === p.month
                        ? 0.88
                        : 0.35
                  }
                />
              ))
            )}
          </svg>
          <div
            className={styles.hitTargets}
            style={{
              gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
            }}
            onMouseLeave={() => setSelected(null)}
            aria-label={label}
          >
            {points.map((p) => (
              <button
                type="button"
                key={p.month}
                className={styles.hitTarget}
                data-selected={active?.month === p.month}
                aria-label={`${monthLabel(p.month)}: ${format(p.value)}${p.partial ? ", partial month" : ""}. ${p.detail}`}
                onFocus={() => setSelected(p.month)}
                onBlur={() => setSelected(null)}
                onMouseEnter={() => setSelected(p.month)}
                onClick={() => setSelected(p.month)}
              >
                <span className={styles.srOnly}>{monthLabel(p.month)}</span>
                {p.value === 0 && (
                  <i
                    className={styles.zeroPoint}
                    style={{ top: `${y(0) / 2}%` }}
                  />
                )}
              </button>
            ))}
          </div>
          <div
            className={styles.xAxis}
            aria-hidden="true"
            style={{
              gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
            }}
          >
            {points.map((p, i) => (
              <span key={p.month}>
                {i === points.length - 1 ||
                (i % tickStep === 0 && points.length - 1 - i >= tickStep * 0.6)
                  ? monthLabel(p.month).replace("20", "’")
                  : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className={styles.chartData}>
        <summary>View chart data</summary>
        <div className={styles.tableScroll}>
          <table>
            <caption className={styles.srOnly}>{label}</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">{unit}</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.month}>
                  <th scope="row">
                    {monthLabel(p.month)}
                    {p.partial ? " (partial)" : ""}
                  </th>
                  <td>{format(p.value)}</td>
                  <td>{p.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function MayaVolumeChart({
  months,
  asOf,
}: {
  months: VolumeMonth[];
  asOf: string;
}) {
  const [mode, setMode] = useState<"monthly" | "cumulative">("monthly");
  const [period, setPeriod] = useState<number | null>(null);
  const series = volumeSeries(months, mode === "cumulative", period);
  const points = series.map((m) => ({
    month: m.month,
    value: m.value,
    detail: `${number(m.count)} reported swaps · ${usd(m.volumeUsd)} monthly volume`,
    partial: m.to * 1000 > Date.parse(asOf),
  }));
  const total =
    mode === "cumulative"
      ? (series.at(-1)?.value ?? 0)
      : series.reduce((sum, m) => sum + m.volumeUsd, 0);
  return (
    <>
      <div className={styles.chartToolbar}>
        <div
          className={styles.segmented}
          role="group"
          aria-label="Volume chart type"
        >
          <button
            type="button"
            aria-pressed={mode === "monthly"}
            onClick={() => setMode("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            aria-pressed={mode === "cumulative"}
            onClick={() => setMode("cumulative")}
          >
            Cumulative
          </button>
        </div>
        <div
          className={styles.periods}
          role="group"
          aria-label="Volume chart period"
        >
          {[6, 12, null].map((p) => (
            <button
              type="button"
              key={p ?? "all"}
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
            >
              {p ? `${p}M` : "All"}
            </button>
          ))}
        </div>
      </div>
      <SeriesChart
        key={`${mode}-${period}`}
        points={points}
        line={mode === "cumulative"}
        unit="USD"
        label={`${mode === "cumulative" ? "Cumulative" : "Monthly"} ZEC pool swap volume`}
        totalLabel={
          mode === "cumulative" ? "All-time total" : "Volume in this period"
        }
        total={total}
      />
      <p className={styles.fine}>
        USD at the time of each swap. Includes native, trade and synth activity.
        The current month is partial.
      </p>
    </>
  );
}

export function MayaEarningsChart({
  earnings,
  asOf,
}: {
  earnings: MayaPosition["earnings"];
  asOf: string;
}) {
  const [gross, setGross] = useState(false);
  const points = earnings.map((m) => ({
    month: m.month,
    value: gross ? m.zcgFeesCacao : m.zcgEarningsCacao,
    detail: `${(m.share * 100).toFixed(2)}% estimated pool share`,
    partial: m.month === asOf.slice(0, 7),
  }));
  return (
    <>
      <div className={styles.chartToolbar}>
        <div
          className={styles.segmented}
          role="group"
          aria-label="Earnings measure"
        >
          <button
            type="button"
            aria-pressed={!gross}
            onClick={() => setGross(false)}
          >
            Net earnings
          </button>
          <button
            type="button"
            aria-pressed={gross}
            onClick={() => setGross(true)}
          >
            Gross fees
          </button>
        </div>
        <span className={styles.fine}>CACAO · estimated</span>
      </div>
      <SeriesChart
        key={String(gross)}
        points={points}
        unit="CACAO"
        label={`Estimated ZCG monthly ${gross ? "gross fees" : "net earnings"}`}
        totalLabel={
          gross ? "Before protocol deductions" : "Accrued inside the position"
        }
        total={points.reduce((sum, p) => sum + p.value, 0)}
      />
    </>
  );
}
