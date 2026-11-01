import { build } from "esbuild";
for (const name of ["archive", "activity"]) {
  await build({ entryPoints: [`scripts/verify-${name}.ts`], outfile: `public/verify/${name}-verify.mjs`, bundle: true, platform: "node", format: "esm", target: "node22", banner: name === "activity" ? { js: 'import { createRequire as archiveCreateRequire } from "node:module"; const require = archiveCreateRequire(import.meta.url);' } : undefined, legalComments: "eof" });
}
