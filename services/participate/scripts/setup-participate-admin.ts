import { parseArgs } from "node:util";
import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "../lib/db";
import { isDemoAccount } from "../lib/auth/email-policy";

class SetupError extends Error {}

// Operator-only bootstrap. Never expose this script through an HTTP route.
// No account is created and email verification is never bypassed.
async function hiddenPassword(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) throw new SetupError("Use an interactive terminal; never pass passwords in arguments or files.");
  process.stdout.write(prompt);
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => { process.stdin.off("data", onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n"); };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003" || char === "\u0004") { finish(); reject(new SetupError("Cancelled.")); return; }
        if (char === "\r" || char === "\n") { finish(); resolve(value); return; }
        if (char === "\u007f" || char === "\b") value = Array.from(value).slice(0, -1).join("");
        else if (char >= " " && Buffer.byteLength(value + char, "utf8") <= 256) value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const { values } = parseArgs({ options: { email: { type: "string" }, apply: { type: "boolean", default: false } } });
  const email = z.string().trim().email().max(254).transform(value => value.toLowerCase()).parse(values.email);
  const users = await db.user.findMany({ where: { email: { equals: email, mode: "insensitive" } }, take: 2, select: { id: true, status: true, emailVerifiedAt: true, passwordHash: true } });
  const user = users[0];
  if (users.length !== 1 || !user || isDemoAccount(user.id) || user.status !== "ACTIVE" || !user.emailVerifiedAt) throw new SetupError("The chosen email must first sign in with a verified code. Disabled, ambiguous and demo accounts are not eligible.");
  if (!values.apply) { console.log("Verified account is eligible. No change made. With --apply, the account receives ADMIN access and a password for the read-only committee preview; committee membership and voting remain unchanged."); return; }
  if (Buffer.byteLength(process.env.ZCAP_SESSION_SECRET ?? "") < 32) throw new SetupError("Configure a strong ZCAP_SESSION_SECRET before enabling admin access.");
  console.log("This grants ADMIN access to the selected verified account. Committee operations remain disabled by default.");
  const password = await hiddenPassword("New admin password (12–72 UTF-8 bytes; hidden): ");
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) throw new SetupError("Use at least 12 characters and no more than 72 UTF-8 bytes.");
  if (password !== await hiddenPassword("Confirm admin password (hidden): ")) throw new SetupError("Passwords did not match.");
  const passwordHash = await hash(password, 12);
  // Recheck verified identity and credential version in the same write.
  const updated = await db.user.updateMany({ where: { id: user.id, status: "ACTIVE", email: { equals: email, mode: "insensitive" }, emailVerifiedAt: user.emailVerifiedAt, passwordHash: user.passwordHash }, data: { role: "ADMIN", passwordHash } });
  if (updated.count !== 1) throw new SetupError("The account changed during setup. No credentials were applied.");
  console.log("Admin access configured. Sign in by email, then select Profile → Committee preview. Password rotation invalidates existing preview grants.");
}
main().catch(error => { console.error(error instanceof z.ZodError ? "Provide --email with the chosen verified account." : error instanceof SetupError ? error.message : "Admin setup failed; no credential details are logged."); process.exitCode = 1; }).finally(() => db.$disconnect());
