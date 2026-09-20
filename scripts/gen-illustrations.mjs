// Rasterises the hand-drawn illustrations of the shell so every image is a PNG.
// Run from the repository root: node scripts/gen-illustrations.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const INK = "#1c1917", GOLD = "#b7791f", GOLD_LIGHT = "#f4b728", STONE = "#d8cfba", WHITE = "#ffffff";

// The ZCG office door, ajar, with a zebra peeking out and looking at you.
// Gold, ink and white only, on a transparent ground, so it sits on either theme.
const door = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="420" viewBox="0 0 520 420">
  <defs>
    <radialGradient id="glow" cx="50%" cy="55%" r="55%">
      <stop offset="0" stop-color="${GOLD_LIGHT}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${GOLD_LIGHT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="room" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b2416"/>
      <stop offset="1" stop-color="#15130f"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3a3126"/>
      <stop offset="1" stop-color="#25201a"/>
    </linearGradient>
    <clipPath id="neck"><path d="M203 300 h84 v100 h-84 z"/></clipPath>
    <clipPath id="head"><path d="M203 236 C203 168 287 168 287 236 L279 322 C276 350 214 350 211 322 Z"/></clipPath>
  </defs>
  <ellipse cx="260" cy="250" rx="230" ry="180" fill="url(#glow)"/>
  <!-- opening -->
  <path d="M150 400 V196 A110 110 0 0 1 370 196 V400 Z" fill="url(#room)"/>
  <!-- door panel, hinged on the right, swung into the room -->
  <path d="M370 196 L300 226 L300 386 L370 400 Z" fill="url(#panel)"/>
  <rect x="312" y="296" width="4" height="34" rx="2" fill="${GOLD}"/>
  <!-- zebra: neck -->
  <path d="M203 300 h84 v100 h-84 z" fill="${WHITE}"/>
  <g clip-path="url(#neck)" fill="${INK}">
    <path d="M203 322 L287 302 L287 316 L203 336 Z"/>
    <path d="M203 352 L287 332 L287 346 L203 366 Z"/>
    <path d="M203 382 L287 362 L287 376 L203 396 Z"/>
    <path d="M203 412 L287 392 L287 406 L203 426 Z"/>
  </g>
  <path d="M203 300 h84" stroke="${INK}" stroke-width="3" fill="none"/>
  <!-- ears -->
  <path d="M212 194 C193 152 214 136 231 182 Z" fill="${WHITE}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M215 188 C204 160 214 150 226 182 Z" fill="${INK}"/>
  <path d="M278 194 C297 152 276 136 259 182 Z" fill="${WHITE}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M275 188 C286 160 276 150 264 182 Z" fill="${INK}"/>
  <!-- head -->
  <path d="M203 236 C203 168 287 168 287 236 L279 322 C276 350 214 350 211 322 Z" fill="${WHITE}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <g clip-path="url(#head)" fill="${INK}">
    <path d="M225 176 C238 164 252 164 265 176 C252 172 238 172 225 176 Z"/>
    <path d="M203 206 Q245 186 287 206 L287 216 Q245 198 203 216 Z"/>
    <path d="M205 244 Q245 232 285 244 L284 253 Q245 243 206 253 Z"/>
    <path d="M209 272 Q245 262 281 272 L280 280 Q245 272 210 280 Z"/>
    <path d="M212 296 Q245 288 278 296 L277 303 Q245 297 213 303 Z"/>
  </g>
  <!-- muzzle -->
  <path d="M217 306 C217 292 273 292 273 306 L271 326 C269 346 221 346 219 326 Z" fill="${INK}"/>
  <ellipse cx="232" cy="322" rx="4" ry="6" fill="#3d3733"/>
  <ellipse cx="258" cy="322" rx="4" ry="6" fill="#3d3733"/>
  <!-- eyes, looking at you -->
  <ellipse cx="222" cy="232" rx="6.5" ry="7.5" fill="${INK}"/>
  <ellipse cx="268" cy="232" rx="6.5" ry="7.5" fill="${INK}"/>
  <circle cx="224" cy="229" r="2" fill="${WHITE}"/>
  <circle cx="270" cy="229" r="2" fill="${WHITE}"/>
  <!-- frame -->
  <path d="M150 400 V196 A110 110 0 0 1 370 196 V400" fill="none" stroke="${GOLD}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M134 406 V196 A126 126 0 0 1 386 196 V406" fill="none" stroke="${STONE}" stroke-width="2"/>
  <rect x="128" y="398" width="264" height="10" rx="3" fill="${GOLD}"/>
  <!-- sign -->
  <rect x="216" y="128" width="88" height="26" rx="5" fill="${GOLD}"/>
  <text x="260" y="146" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="4" fill="${WHITE}">ZCG</text>
</svg>`;

mkdirSync("public/illustrations", { recursive: true });
await sharp(Buffer.from(door), { density: 192 }).png().toFile("public/illustrations/zcg-door.png");
console.log("illustrations written");
