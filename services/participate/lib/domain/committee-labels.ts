import { z } from "zod";
import catalog from "@/data/zcg-labels.json";

export const COMMITTEE_LABEL_CATALOG = catalog;
export const COMMITTEE_LABEL_GROUPS = ["Review", "Grant progress", "Payments", "Compliance", "Milestones"] as const;
export const COMMITTEE_LABELS = [...catalog.labels].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
export type CommitteeLabel = (typeof COMMITTEE_LABELS)[number];
const known = new Set(COMMITTEE_LABELS.map(label => label.id));
export const committeeLabelIds = z.array(z.string().max(32).refine(id => known.has(id), "Unknown committee label")).max(100)
  .refine(ids => new Set(ids).size === ids.length, "Choose each label once")
  .transform(ids => ids.sort());

export function selectedCommitteeLabels(ids: readonly string[] = []) {
  return COMMITTEE_LABELS.filter(label => ids.includes(label.id));
}

/** Preserve GitHub colors and choose the WCAG-contrast foreground. */
export function committeeLabelInk(hex: string) {
  const rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? "#000000" : "#ffffff";
}

/** Match GitHub/Primer's IssueLabel colors in both themes, preserving the source hex. */
export function committeeLabelStyle(hex: string) {
  const [red, green, blue] = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const [r, g, b] = [red, green, blue].map(value => value / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = Math.round((hue * 60 + 360) % 360);
  // Primer rounds HSL channels before applying its perceived-lightness correction.
  const hsl = `${hue} ${Math.round(saturation * 100)}%`;
  const perceived = .2126 * r + .7152 * g + .0722 * b;
  const darkLightness = Math.round(lightness * 100) + Math.max(0, .6 - perceived) * 100;
  const borderAlpha = Math.max(0, Math.min(1, (perceived - .96) * 100));
  return {
    "--label-color": `#${hex}`,
    "--label-ink": committeeLabelInk(hex),
    "--label-border": `hsl(${hsl} ${Math.round(lightness * 100) - 25}% / ${borderAlpha})`,
    "--label-dark-color": `rgb(${red} ${green} ${blue} / 18%)`,
    "--label-dark-ink": `hsl(${hsl} ${darkLightness}%)`,
    "--label-dark-border": `hsl(${hsl} ${darkLightness}% / 30%)`
  };
}
