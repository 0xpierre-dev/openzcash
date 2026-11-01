// @vitest-environment node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildNativeProposalPackage } from "@/lib/archive/native-proposals";
import { EMPTY_SUBMISSION } from "@/lib/domain/proposal-submission";

it("recovers a native proposal with the downloadable verifier, outside the app and database", async () => {
  const folder = await mkdtemp(join(tmpdir(), "participate-native-verifier-"));
  try {
    const body = "## Work\n\nA native proposal with a complete explanation, measurable milestones and an independently verifiable public record.\n";
    const forumUrl = "https://forum.zcashcommunity.com/t/pilot-proposal/12345";
    const checked = await buildNativeProposalPackage("pilot-native-test", { ...EMPTY_SUBMISSION, title: "Native proposal recovery", applicant: "Demo team", body, requestedAmountUsd: "1250.25", forumUrl }, "2026-10-10T00:00:00.000Z");
    const file = join(folder, "proposal.zvoice.json"), target = join(folder, "recovered");
    await writeFile(file, JSON.stringify(checked.bundle));
    const result = await promisify(execFile)(process.execPath, [resolve("public/verify/archive-verify.mjs"), file, "--hash", checked.manifestHash, "--extract", target], { cwd: folder });
    expect(result.stderr).toBe("");
    expect(await readFile(join(target, "files/proposal.md"), "utf8")).toBe(body);
    const fields = JSON.parse(await readFile(join(target, "files/application.json"), "utf8"));
    expect(fields).toMatchObject({ publication: "PILOT_DEMO", externalReview: "NOT_SUBMITTED", requestedAmountUsdCents: "125025", forumUrl });
    const damaged = structuredClone(checked.bundle);
    damaged.files[0].data = Buffer.from("replaced content").toString("base64");
    await writeFile(file, JSON.stringify(damaged));
    await expect(promisify(execFile)(process.execPath, [resolve("public/verify/archive-verify.mjs"), file, "--hash", checked.manifestHash], { cwd: folder })).rejects.toThrow();
  } finally { await rm(folder, { recursive: true, force: true }); }
});
