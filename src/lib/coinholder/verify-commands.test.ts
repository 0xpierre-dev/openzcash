/**
 * The page's commands and the downloadable script, run for real against the
 * stored copy of the Q3 2026 vote-chain summary (no network). Skipped where
 * jq or python3 is not installed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUNDS } from "./rounds";
import { verifyRound } from "./verify";
import { verifyJson } from "./verify-export";
import { chainCommands } from "./verify-sources";

const FIXTURE = join(
  process.cwd(),
  "src/lib/coinholder/fixtures/q3-2026-vote-summary.json",
);
const SCRIPT = join(process.cwd(), "public/verify/coinholder_verify.py");
const has = (bin: string) => spawnSync(bin, ["--version"]).status === 0;
const q3 = ROUNDS.find((r) => r.id === "q3-2026")!;
const published = new Map(
  q3.proposals.map((p) => [
    p.question,
    p.outcome === "funded" ? "Funded" : "Rejected",
  ]),
);
const cmd = chainCommands("q3-2026")!;

const sh = (script: string, cwd: string) =>
  execFileSync("bash", ["-c", script], { cwd, encoding: "utf8" });
const workdir = () => {
  const dir = mkdtempSync(join(tmpdir(), "coinholder-verify-"));
  copyFileSync(FIXTURE, join(dir, cmd.file));
  return dir;
};

describe("the page's commands", () => {
  it("only exist for a round on the vote chain", () => {
    expect(chainCommands("q1-2026")).toBeNull();
    expect(cmd.fetch).toContain(
      "https://zvote.zfnd.org/shielded-vote/v1/vote-summary/2cba66eb",
    );
    expect(cmd.python.download).toBe(
      "curl -sO https://openzcash.org/verify/coinholder_verify.py",
    );
    expect(cmd.python.run).toBe(
      "python3 coinholder_verify.py 2cba66eb16c7581a1692cb0b033785da0131059f645a0d2fb4dc2a5131505e01 > q3-2026.csv",
    );
    expect(cmd.python.compare).toContain(
      "--compare 'https://openzcash.org/api/coinholders/verify?round=q3-2026&format=json'",
    );
  });

  it.skipIf(!has("jq"))(
    "convert every option to ZEC and apply ZIP 1016 to the published outcomes",
    () => {
      const dir = workdir();
      const converted = sh(cmd.convert, dir).trim().split("\n");
      expect(converted).toHaveLength(37);
      expect(converted[13]).toBe("14,757044.25,187236.625,196044,1038923.25");
      const applied = sh(cmd.apply, dir)
        .trim()
        .split("\n")
        .map((l) => l.split(","));
      expect(applied).toHaveLength(37);
      for (const [ballot, , quorum, outcome] of applied) {
        expect(quorum, ballot).toBe("true");
        expect(outcome.replace(/"/g, ""), ballot).toBe(
          published.get(Number(ballot)),
        );
      }
      // The one-liner, with the download replaced by the stored copy.
      const oneLiner = cmd.oneLiner.replace(/^curl -s \S+/, `cat ${cmd.file}`);
      expect(oneLiner).not.toBe(cmd.oneLiner);
      const rows = sh(oneLiner, dir).trim().split("\n");
      expect(rows[13]).toBe(
        '14,757044.25,187236.625,196044,1038923.25,2179248.125,"Funded"',
      );
    },
  );

  /** Runs the script with the network replaced by local files: the summary and, for --compare, our JSON. */
  const runScript = (summary: string, ours: object) => {
    const dir = workdir();
    const oursPath = join(dir, "ours.json");
    writeFileSync(oursPath, JSON.stringify(ours));
    const runner = `
import io, runpy, sys, urllib.request
files = {"summary": ${JSON.stringify(summary)}, "ours": ${JSON.stringify(oursPath)}}
class Body(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False
def urlopen(req, timeout=None):
    url = req.full_url if hasattr(req, "full_url") else req
    return Body(open(files["ours" if "openzcash" in url else "summary"], "rb").read())
urllib.request.urlopen = urlopen
sys.argv = ["coinholder_verify.py", "--compare", "https://openzcash.org/api/coinholders/verify?round=q3-2026&format=json"]
runpy.run_path(${JSON.stringify(SCRIPT)}, run_name="__main__")
`;
    return spawnSync("python3", ["-c", runner], { encoding: "utf8" });
  };
  const ourJson = () =>
    JSON.parse(JSON.stringify(verifyJson(q3, verifyRound(q3), null))) as {
      rows: Record<string, unknown>[];
    };

  it.skipIf(!has("python3"))(
    "the Python script recounts the round, prints the hash and agrees with this site's JSON",
    () => {
      const run = runScript(FIXTURE, ourJson());
      expect(run.status, run.stderr).toBe(0);
      const lines = run.stdout.trim().split(/\r?\n/);
      expect(lines[0]).toBe(
        "ballot,title,accept,reject,lower,abstain,total,quorum,share,outcome",
      );
      expect(lines).toHaveLength(38);
      expect(lines[14]).toBe(
        '14,"Connaugh Zcash Videos — $22,000 USD (Connaugh)",757044.250,187236.625,196044.000,1038923.250,2179248.125,yes,66.39,Funded',
      );
      expect(run.stderr).toContain(
        "sha256 9b858326b8149de92ea6788314a714b521fb2f57215e3742ec9b35b67c6639b5",
      );
      expect(run.stderr).toContain("compare: 37 of 37 agree");
      expect(
        readFileSync(SCRIPT, "utf8").split("\n").length,
      ).toBeLessThanOrEqual(60);
    },
  );

  it.skipIf(!has("python3"))(
    "the script's --compare also checks our rule outcome, total and quorum, and rows the chain does not have",
    () => {
      const ours = ourJson();
      const row = (b: number) => ours.rows.find((r) => r.ballot === b)!;
      row(5).rule = "Funded";
      row(14).total = 2_179_248;
      row(21).quorumMet = false;
      ours.rows.push({ ...row(1), ballot: 38 });
      const run = runScript(FIXTURE, ours);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("compare: 34 of 37 agree");
      expect(run.stderr).toContain("differ: [5, 14, 21]");
      expect(run.stderr).toContain("not on the vote chain: [38]");
    },
  );

  it.skipIf(!has("python3"))(
    "the script refuses a summary of another round",
    () => {
      const dir = workdir();
      const other = JSON.parse(readFileSync(FIXTURE, "utf8"));
      other.vote_round_id = Buffer.alloc(32, 7).toString("base64");
      const path = join(dir, "other.json");
      writeFileSync(path, JSON.stringify(other));
      const run = runScript(path, ourJson());
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain("answered for another round");
      expect(run.stdout).toBe("");
    },
  );
});
