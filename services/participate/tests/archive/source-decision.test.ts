// @vitest-environment node
import { readPilotPackages } from "@/lib/archive/catalog";
import { canonicalJson, sha256, utf8 } from "@/lib/archive/format";
import { readSourceDecision } from "@/lib/archive/source-decision";
import { ZCG_PROPOSAL_EXAMPLES } from "@/lib/data/zcg-proposal-examples";
import { decisionPackage } from "@/tests/helpers/signed-decision";

it("reads all five historical decisions and their feedback from the pinned revision", async () => {
  const packages = await readPilotPackages();
  for (const item of packages) {
    expect(await readSourceDecision(item.bundle, item.manifestHash)).toEqual(ZCG_PROPOSAL_EXAMPLES.find(example => example.id === item.manifest.recordId));
  }
});

it("never fills an unpublished decision from historical demo data", async () => {
  const item = await decisionPackage();
  expect(await readSourceDecision(item.bundle, item.manifestHash)).toBeNull();
});

it.each(["duplicate member", "missing member", "wrong date", "wrong identity", "unlisted source", "tampered feedback"])("does not present a %s as a preserved source decision", async variant => {
  const item = (await readPilotPackages())[0];
  const bundle = structuredClone(item.bundle), manifest = structuredClone(item.manifest);
  const file = bundle.files.find(entry => entry.path === "record.json")!;
  const record = JSON.parse(Buffer.from(file.data, "base64").toString("utf8"));
  if (variant === "duplicate member") record.votes[0].memberId = record.votes[1].memberId;
  if (variant === "missing member") record.votes.pop();
  if (variant === "wrong date") record.decisionDate = "2026-09-27";
  if (variant === "wrong identity") record.id = "another-record";
  if (variant === "unlisted source") record.minutesUrl = "https://forum.zcashcommunity.com/t/unrelated/1";
  if (variant === "tampered feedback") record.votes[0].summary = "An unrecorded comment";
  const bytes = utf8(canonicalJson(record));
  file.data = Buffer.from(bytes).toString("base64");
  // Recompute only the test fixture's digest to exercise semantic checks after verification.
  const entry = manifest.files.find(entry => entry.path === "record.json")!;
  entry.bytes = bytes.length; entry.sha256 = await sha256(bytes);
  bundle.manifest = canonicalJson(manifest);
  const hash = variant === "tampered feedback" ? item.manifestHash : await sha256(utf8(bundle.manifest));
  await expect(readSourceDecision(bundle, hash)).rejects.toThrow();
});
