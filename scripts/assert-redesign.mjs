import postgres from "postgres";
// Isolation check for the redesign test environment. When OPENZCASH_ENV is
// "redesign" the process must be running in the dedicated Railway environment
// against the isolated database, never against production data. Any other
// environment (production included) skips the check. Redesign deployments must
// configure REDESIGN_ENVIRONMENT_ID and REDESIGN_DATABASE_NAME privately.
if (process.env.OPENZCASH_ENV !== "redesign") {
  console.log(
    "[redesign] OPENZCASH_ENV is not 'redesign'; isolation check skipped.",
  );
  process.exit(0);
}
const expectedEnvironment = process.env.REDESIGN_ENVIRONMENT_ID;
const expectedDatabase = process.env.REDESIGN_DATABASE_NAME;
// Keep deployment identifiers in private environment configuration.
if (!expectedEnvironment || !expectedDatabase) {
  throw new Error("Redesign deployment requires its private environment configuration.");
}
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
