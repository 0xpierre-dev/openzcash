/** The owner's log reader, run for real on a fixture of deploy-log lines (Railway prefix, non-JSON noise, older lines without a topic). Skipped where python3 is not installed. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts/zarvis-topics.py");
const FIXTURE = readFileSync(join(process.cwd(), "src/lib/zarvis/fixtures/zarvis-topics-log.txt"), "utf8");
const has = (command: string) => spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0;
const run = (...args: string[]) => spawnSync("python3", ["-I", SCRIPT, ...args], { input: FIXTURE, encoding: "utf8" });

describe("scripts/zarvis-topics.py", () => {
  it.skipIf(!has("python3"))("aggregates count, share, route split and median latency per topic", () => {
    const result = run("--json");
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.period).toEqual({ from: "2026-10-07T09:00:01.000Z", to: "2026-10-08T01:00:00.000Z" });
    expect(report.labelled).toBe(7);
    expect(report.unlabelled).toBe(1);
    expect(report.rejected).toBe(1);
    expect(report.topics.map((row: { topic: string }) => row.topic)).toEqual(["price", "wallets", "treasuries"]);
    expect(report.topics[0]).toEqual({ topic: "price", count: 3, share: 0.429, local: 2, model: 1, localShare: 0.667, modelShare: 0.333, failed: 0, medianMs: 120 });
    expect(report.topics[1]).toEqual({ topic: "wallets", count: 3, share: 0.429, local: 0, model: 3, localShare: 0, modelShare: 1, failed: 1, medianMs: 7000 });
    expect(report.languages).toEqual({ en: 4, pt: 2, es: 1 });
    expect(report.byLanguage.price).toEqual({ en: 1, pt: 1, es: 1 });
  });
  it.skipIf(!has("python3"))("prints a table without any question text and filters by day", () => {
    const table = run();
    expect(table.status, table.stderr).toBe(0);
    expect(table.stdout).toContain("price");
    expect(table.stdout).toMatch(/wallets\s+3\s+42\.9%/);
    expect(table.stdout).toContain("7 labelled");
    const filtered = run("--json", "--since", "2026-10-08");
    expect(JSON.parse(filtered.stdout).topics).toEqual([{ topic: "treasuries", count: 1, share: 1, local: 1, model: 0, localShare: 1, modelShare: 0, failed: 0, medianMs: 60 }]);
    const empty = run("--json", "--until", "2026-10-06");
    expect(JSON.parse(empty.stdout)).toMatchObject({ labelled: 0, topics: [] });
  });
});
