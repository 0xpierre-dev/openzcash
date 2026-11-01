import { db } from "../lib/db";
import { grantOperatorDemoCredits } from "../lib/services/demo-credit-grants";
import { ParticipationCreditError } from "../lib/services/participation-credits";

// Explicit identity + scope + retry key; dry-run unless the final flag is --apply.
async function main() {
  const [userId, nick, communityId, amountText, requestKey, reason, mode, ...extra] = process.argv.slice(2);
  if (extra.length || (mode !== undefined && mode !== "--apply") || !/^[1-9]\d*$/.test(amountText ?? "")) throw new Error("INVALID_OPERATOR_ARGUMENTS");
  const result = await grantOperatorDemoCredits({ userId, nick, communityId, amount: Number(amountText), requestKey, reason }, mode === "--apply");
  console.log(JSON.stringify({ time: new Date().toISOString(), event: "operator_demo_credit_grant", userId, nick, communityId, amount: Number(amountText), requestKey, ...result }));
}
main().catch(error => {
  console.error(JSON.stringify({ event: "operator_demo_credit_grant_failed", code: error instanceof ParticipationCreditError ? error.code : "DEMO_GRANT_UNAVAILABLE" }));
  process.exitCode = 1;
}).finally(() => db.$disconnect());
