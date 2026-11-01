import { parseArgs } from "node:util";
import { db } from "../lib/db";
import { bootstrapCommitteeOwner } from "../lib/services/committee-bootstrap";

async function main() {
  const { values } = parseArgs({ options: { host: { type: "string" }, email: { type: "string" }, name: { type: "string" }, apply: { type: "boolean", default: false } } });
  if (!values.host || !values.email || !values.name) throw new Error("Required: --host <archive host> --email <verified account> --name <public name>. Dry-run by default; --apply initializes the first owner.");
  console.log(JSON.stringify(await bootstrapCommitteeOwner(values.host, values.email, values.name, values.apply), null, 2));
}
main().catch(() => { console.error("Owner setup was not applied. Check the arguments, verified account and existing owner. No credentials or account addresses are logged."); process.exitCode = 1; }).finally(() => db.$disconnect());
