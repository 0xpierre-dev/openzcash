// Rasterises the menu marks so every image in the shell is a PNG: app badges for
// apps without an official logo, inner-page glyphs, and the ZF and brand vectors.
// Run from the repository root: node scripts/gen-app-icons.mjs
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync("src/components/icons.tsx", "utf8");
function shape(name) {
  const head = `export const ${name} = svg(`;
  const start = src.indexOf(head);
  if (start < 0) throw new Error("icon not found: " + name);
  // The body runs to the next export (single-line icons close on the same line).
  const next = src.indexOf("\nexport const", start + head.length);
  let body = src.slice(start + head.length, next < 0 ? src.length : next).trim();
  body = body.replace(/\);\s*$/, "").trim();
  body = body.replace(/^<>/, "").replace(/<\/>\s*,?\s*$/, "").trim();
  // JSX to plain SVG: drop comments and expressions, kebab-case the attributes.
  return body
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/=\{([^}]*)\}/g, '="$1"')
    .replace(/strokeWidth/g, "stroke-width")
    .replace(/strokeLinecap/g, "stroke-linecap")
    .replace(/strokeLinejoin/g, "stroke-linejoin")
    .replace(/fillRule/g, "fill-rule")
    .replace(/clipRule/g, "clip-rule")
    .replace(/\s+className="[^"]*"/g, "")
    .replace(/\s+/g, " ");
}
const GOLD = "#f4b728", INK = "#1c1917";
// App badges: gold icon on a rounded stone square (the launcher's language).
const APPS = { monthly: "IconBook", news: "IconNews", lockbox: "IconShield", defi: "IconSwap", z3: "IconTerminal", wallets: "IconWallet", ecosystem: "IconGlobe", manage: "IconGrid" };
for (const [id, icon] of Object.entries(APPS)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="${INK}"/><g transform="translate(28 28) scale(3)" fill="none" stroke="${GOLD}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${shape(icon)}</g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`public/logos/apps/${id}.png`);
}
// Inner-page glyphs: gold on transparent, used small.
const PAGES = { grants: "IconGrant", proposals: "IconVote", disbursements: "IconReceipt", recipients: "IconUsers", schedule: "IconList", totals: "IconChart", insights: "IconArrowUp", reconciliation: "IconCheck", committee: "IconUsers", meetings: "IconBook", stipends: "IconCoins", budget: "IconBalance", office: "IconDashboard", methodology: "IconBook", copilot: "IconTerminal", coinholder: "IconCoins", development: "IconTerminal", "viewing-keys": "IconKey", invites: "IconMail", onboarding: "IconPencil", login: "IconShield", overview: "IconDashboard", home: "IconGrid" };
for (const [id, icon] of Object.entries(PAGES)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#d6c49a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${shape(icon)}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`public/logos/pages/${id}.png`);
}
// Official vector marks rasterised once, so every menu image is a PNG.
await sharp("public/logos/zf.svg").resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile("public/logos/apps/zf.png");
await sharp("public/zcash-mark.svg").resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile("public/logos/apps/openzcash.png");
console.log("generated", Object.keys(APPS).length + Object.keys(PAGES).length + 2, "PNGs");
