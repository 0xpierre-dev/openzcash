import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // The process/tunnel checks use node:test, not Vitest's suite registry.
    // Run them separately with npm run test:runtime.
    exclude: [...configDefaults.exclude, "deploy/**/*.test.mjs"],
    // Database suites share one schema. Serialize files to avoid unrelated SSI
    // predicate conflicts; each suite still exercises concurrent transactions.
    fileParallelism: !(process.env.TREASURY_TEST_DATABASE_URL || process.env.CREDITS_TEST_DATABASE_URL),
    setupFiles: ["./tests/setup.ts"]
  },
  resolve: {
    alias: {
      "@": rootDir
    }
  }
});
