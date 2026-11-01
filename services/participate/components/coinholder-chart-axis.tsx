"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const coinholderPlot = { viewWidth: 872, viewHeight: 252, left: 46, top: 16, width: 802, height: 190 };
const numbers = new Intl.NumberFormat("en-US");

type ChartGeometry = { width: number; scale: number; offsetX: number; offsetY: number; svgLeft: number; letterboxX: number };

/** Integer counts use readable 1/2/2.5/5 steps, never fractional count labels. */
export function coinholderCountScale(peak: number, intervals = 5) {
  if (!Number.isFinite(peak) || peak < 0) throw new Error("Invalid count scale");
  const target = Math.max(1, peak / Math.max(1, Math.floor(intervals)));
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 2.5, 5, 10].map(value => value * magnitude).find(value => Number.isInteger(value) && value >= target)!;
  const max = Math.max(step, Math.ceil(peak / step) * step);
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, index) => index * step) };
}

export function coinholderAxisIndices(length: number, width = coinholderPlot.width) {
  if (length <= 0) return [];
  const count = Math.min(length, 5, Math.max(2, Math.floor(width / 70) + 1));
  if (count === 1) return [0];
  return [...new Set(Array.from({ length: count }, (_, index) => Math.round(index * (length - 1) / (count - 1))))];
}

/** Measure the SVG's xMidYMid meet transform, including the wrapper's mobile gutter. */
export function useCoinholderChartGeometry() {
  const svg = useRef<SVGSVGElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<ChartGeometry | null>(null);
  const measure = useCallback(() => {
    const bounds = svg.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return null;
    const wrapper = container.current?.getBoundingClientRect();
    const scale = Math.min(bounds.width / coinholderPlot.viewWidth, bounds.height / coinholderPlot.viewHeight);
    const letterboxX = (bounds.width - coinholderPlot.viewWidth * scale) / 2;
    const measured = {
      width: wrapper?.width || bounds.width, scale, svgLeft: bounds.left, letterboxX,
      offsetX: (wrapper?.width ? bounds.left - wrapper.left : 0) + letterboxX,
      offsetY: (wrapper?.height ? bounds.top - wrapper.top : 0) + (bounds.height - coinholderPlot.viewHeight * scale) / 2,
    };
    setGeometry(previous => previous && Object.keys(measured).every(key => previous[key as keyof ChartGeometry] === measured[key as keyof ChartGeometry]) ? previous : measured);
    return measured;
  }, []);
  useEffect(() => {
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (svg.current) observer?.observe(svg.current);
    if (container.current) observer?.observe(container.current);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);
  return { svg, container, geometry, measure };
}

export function coinholderAxisIntervals(geometry: ChartGeometry | null) {
  return geometry ? Math.max(1, Math.min(5, Math.floor(coinholderPlot.height * geometry.scale / 24))) : 5;
}

export function coinholderTooltipPercent(x: number, geometry: ChartGeometry | null) {
  return geometry ? (geometry.offsetX + x * geometry.scale) / geometry.width * 100 : x / coinholderPlot.viewWidth * 100;
}

/** HTML labels retain their actual font size instead of shrinking with the SVG viewBox. */
export function CoinholderChartAxes({ geometry, ticks, max, labels }: {
  geometry: ChartGeometry | null;
  ticks: number[];
  max: number;
  labels: { x: number; label: string; detail?: string }[];
}) {
  const plot = coinholderPlot;
  return <div className="coin-axis-overlay" aria-hidden="true">
    {ticks.map(value => {
      const y = plot.top + plot.height - value / max * plot.height;
      return <span className="coin-axis-y" key={value} style={{
        left: geometry ? geometry.offsetX + plot.left * geometry.scale - 8 : `calc(${plot.left / plot.viewWidth * 100}% - 8px)`,
        top: geometry ? geometry.offsetY + y * geometry.scale : `${y / plot.viewHeight * 100}%`,
      }}>{numbers.format(value)}</span>;
    })}
    {labels.map(({ x, label, detail }, index) => <span className="coin-axis-x" key={index} data-axis-x={x} style={{
      left: geometry ? geometry.offsetX + x * geometry.scale : `${x / plot.viewWidth * 100}%`,
      top: geometry ? geometry.offsetY + (plot.top + plot.height) * geometry.scale + 12 : `calc(${(plot.top + plot.height) / plot.viewHeight * 100}% + 12px)`,
    }}>{label}{detail ? <span className="coin-axis-x-detail">{detail}</span> : null}</span>)}
  </div>;
}
