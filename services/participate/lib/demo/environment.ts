import { env as processEnvironment } from "node:process";
import { db } from "@/lib/db";

// The committee demo is a separate deployment with its own database. Every
// demo-only code path asks `demoEnvironmentActive()` first. It is true only when
// the deployment opts in AND the connected database is a demo database AND that
// database carries the marker row written by scripts/demo/participate-demo.sql.
// The production database (`participate`) can satisfy none of these.
export const DEMO_DATABASE_NAME = /^participate_demo(?:_[a-z0-9]{1,40})?$/;
export const DEMO_MARKER_ID = "participate-committee-demo";
const PRODUCTION_HOSTS = new Set(["openzcash.org", "www.openzcash.org"]);

type Environment = Record<string, string | undefined>;

export class DemoError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

function hostOf(value: string | undefined) {
  try {
    return value ? new URL(value).hostname : null;
  } catch {
    return null;
  }
}

function databaseName(value: string | undefined) {
  try {
    return value ? decodeURIComponent(new URL(value).pathname.slice(1)) : null;
  } catch {
    return null;
  }
}

export function demoEnvironmentRequested(
  env: Environment = processEnvironment,
) {
  return env.PARTICIPATE_DEMO_ENVIRONMENT === "true";
}

/** Returns why this process may not run demo code, or null when the configuration qualifies. */
export function demoConfigurationProblem(
  env: Environment = processEnvironment,
): string | null {
  if (!demoEnvironmentRequested(env)) return "DEMO_FLAG_OFF";
  if (
    env.PARTICIPATE_COMMITTEE_ENABLED !== "true" ||
    env.PARTICIPATE_PUBLIC_DEMO === "true"
  )
    return "DEMO_COMMITTEE_OFF";
  if (!DEMO_DATABASE_NAME.test(databaseName(env.DATABASE_URL) ?? ""))
    return "DEMO_DATABASE_REQUIRED";
  const origins = [
    env.APP_BASE_URL,
    env.PASSKEY_ORIGIN,
    env.PARTICIPATE_PARENT_ORIGIN,
  ].filter(Boolean);
  if (
    !origins.length ||
    origins.some((origin) => {
      const host = hostOf(origin);
      return !host || PRODUCTION_HOSTS.has(host);
    })
  )
    return "DEMO_ORIGIN_REQUIRED";
  // Demo databases never anchor, sign on chain or run the source worker.
  if (
    env.PARTICIPATE_AUTOMATION_CONFIG ||
    env.ARCHIVE_TESTNET_SIGNING_ENABLED === "true" ||
    env.ARCHIVE_WRITER_RPC_URL ||
    env.ZALLET_RPC_URL
  )
    return "DEMO_EXTERNAL_WRITES_CONFIGURED";
  return null;
}

type Queryable = Pick<typeof db, "$queryRaw">;
let confirmed = false;

export async function demoEnvironmentActive(
  client: Queryable = db,
  env: Environment = processEnvironment,
) {
  if (demoConfigurationProblem(env)) return false;
  if (confirmed && client === db) return true;
  const [row] = await client.$queryRaw<
    Array<{ database: string; marker: string | null }>
  >`
    SELECT current_database() AS "database", to_regclass('"ParticipateDemoEnvironment"')::text AS "marker"`;
  if (!row || !DEMO_DATABASE_NAME.test(row.database) || !row.marker)
    return false;
  const [marker] = await client.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ParticipateDemoEnvironment" WHERE "id" = ${DEMO_MARKER_ID} AND "databaseName" = current_database()`;
  if (!marker) return false;
  if (client === db) confirmed = true;
  return true;
}

export async function requireDemoEnvironment(client: Queryable = db) {
  if (!(await demoEnvironmentActive(client)))
    throw new DemoError("DEMO_UNAVAILABLE", 404);
}

export function resetDemoEnvironmentCache() {
  confirmed = false;
}
