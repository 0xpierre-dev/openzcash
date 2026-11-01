import { build } from "esbuild";
await build({ entryPoints: ["scripts/verify-decision.ts"], outfile: "public/verify/decision-verify.mjs", bundle: true, platform: "node", format: "esm", target: "node22", minify: true,
  banner: { js: 'import { createRequire as decisionCreateRequire } from "node:module"; const require = decisionCreateRequire(import.meta.url);' },
  legalComments: "eof" });
