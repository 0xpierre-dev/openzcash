import postgres from "postgres";
// Isolation check for the redesign test environment. When OPENZCASH_ENV is
// "redesign" the process must be running in the dedicated Railway environment
// against the isolated database, never against production data. Any other
// environment (production included) skips the check, so the same branch can be
// deployed there once the redesign is approved.
if (process.env.OPENZCASH_ENV !== "redesign") {
  console.log(
    "[redesign] OPENZCASH_ENV is not 'redesign'; isolation check skipped.",
  );
  process.exit(0);
}
const expectedEnvironment = "c28d22c7-0df0-47c5-92e5-361df867ee42";
const expectedDatabase = "openzcash_redesign";
if (process.env.RAILWAY_ENVIRONMENT_ID !== expectedEnvironment) {
  throw new Error(
    "Redesign deployment requires its dedicated Railway environment.",
  );
}
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  url.hostname !== "postgres-db.railway.internal" ||
  url.pathname !== `/${expectedDatabase}`
) {
  throw new Error("Redesign deployment requires its isolated database.");
}
const sql = postgres(url.toString(), { max: 1 });
try {
  const [row] = await sql`SELECT current_database() AS name`;
  if (row.name !== expectedDatabase) throw new Error("Unexpected database.");
  console.log("[redesign] Dedicated environment and database verified.");
} finally {
  await sql.end();
}
