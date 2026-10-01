import type { ReactNode } from "react";
import { ZIP_1016_RULE, type RoundCheck } from "@/lib/coinholder/verify";
import type { ChainReport } from "@/lib/coinholder/verify-export";
import {
  RECOUNTS,
  SCRIPT_PATH,
  chainCommands,
  type Recount,
} from "@/lib/coinholder/verify-sources";
import {
  expectations,
  sheetFormulas,
  vetoNote,
  type Expectations,
} from "@/lib/coinholder/verify-view";
import type { Link as SourceLink, Round } from "@/lib/coinholder/types";
import { Guide, type GuideStep, type GuideTab } from "./guide";
import styles from "./verify.module.css";

type Commands = NonNullable<ReturnType<typeof chainCommands>>;

const P = ({ children }: { children: ReactNode }) => (
  <p className={styles.stepCopy}>{children}</p>
);

function StepLinks({ links }: { links: SourceLink[] }) {
  return links.length ? (
    <p className={styles.stepLinks}>
      {links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
          {l.label} ↗
        </a>
      ))}
    </p>
  ) : null;
}

const hashChip = (e: Expectations) =>
  e.hash ? { text: e.hash.text, title: e.hash.full } : { text: "sha256" };

/** curl and jq: fetch, convert, apply, and the three in one line. */
function jqTab(
  cmd: Commands,
  e: Expectations,
  chain: ChainReport | null,
): GuideTab {
  return {
    id: "jq",
    label: "curl + jq",
    steps: [
      {
        n: "1",
        title: "Fetch",
        gist: "the finalized summary, from the ZF mirror",
        expect: hashChip(e),
        body: (
          <P>
            Download the finalized summary from the Zcash Foundation&apos;s
            mirror (Valar Group&apos;s primary serves the same bytes) and hash
            it.
            {chain?.status === "ok" && e.hash ? (
              <>
                {" "}
                The hash should match the one above, in full:{" "}
                <code>{e.hash.full}</code>.
              </>
            ) : null}
          </P>
        ),
        code: { text: cmd.fetch, label: "Fetch the summary and hash it" },
      },
      {
        n: "2",
        title: "Convert",
        gist: "every option divided by 8",
        expect: { text: e.rows },
        body: (
          <P>
            Each option&apos;s <code>total_value</code> counts units of 0.125
            ZEC: divide by 8. An option no one chose leaves the field out, so
            read it as 0. Options come in ballot order: Accept, Reject, Reject
            at a lower amount, Abstain. Leave <code>ballot_count</code> aside:
            it counts revealed encrypted shares, not voters.
          </P>
        ),
        code: { text: cmd.convert, label: "Convert every option to ZEC" },
      },
      {
        n: "3",
        title: "Apply ZIP 1016",
        gist: "420,000 ZEC voted, and Accept above both Rejects",
        expect: { text: e.outcomes },
        body: <P>{ZIP_1016_RULE.text}</P>,
        code: { text: cmd.apply, label: "Apply ZIP 1016" },
      },
      {
        n: "",
        title: "In one line: curl and jq",
        gist: "the three steps at once",
        expect: { text: e.outcomes },
        body: (
          <P>
            Fetch, convert and apply the rule; prints ballot, the four options,
            total and outcome.
          </P>
        ),
        code: {
          text: cmd.oneLiner,
          label: "The whole check in one line",
          wrap: true,
        },
      },
    ],
  };
}

/** The standard-library script: download it, run it (it fetches, converts and applies ZIP 1016 in one go), then compare with this page's JSON. */
function pythonTab(cmd: Commands, e: Expectations): GuideTab {
  return {
    id: "python",
    label: "Python",
    steps: [
      {
        n: "1",
        title: "Download the script",
        gist: "it fetches the summary itself",
        expect: { text: e.script },
        body: (
          <P>
            Standard library only, served as plain text.{" "}
            <a href={SCRIPT_PATH} target="_blank" rel="noreferrer">
              Read it first ↗
            </a>{" "}
            It fetches the finalized summary from the ZF mirror (
            <code>--host valar</code> asks Valar Group) and checks that the body
            names this round.
          </P>
        ),
        code: { text: cmd.python.download, label: "Download the Python check" },
      },
      {
        n: "2",
        title: "Run it",
        gist: "fetch, convert and apply ZIP 1016: CSV and SHA-256",
        expect: { text: e.run, title: e.hash?.full },
        body: (
          <P>
            It divides every option by 8 and applies ZIP 1016, printing the
            tally as CSV on stdout and the SHA-256 of what it fetched on stderr.
          </P>
        ),
        code: { text: cmd.python.run, label: "Run the Python check" },
      },
      {
        n: "3",
        title: "Compare",
        gist: "against this page's JSON, ballot by ballot",
        expect: { text: e.compare },
        body: (
          <P>
            With <code>--compare</code> it checks every figure and outcome
            against this page&apos;s JSON, ballot by ballot: the four options,
            total, quorum, rule outcome and published outcome. It exits 1 on any
            difference, or a ballot the chain does not have.
          </P>
        ),
        code: {
          text: cmd.python.compare,
          label: "Run the Python check against this page",
        },
      },
    ],
  };
}

/** Google Sheets or Excel on this page's CSV: the rule, checked on OpenZcash's numbers. */
function sheetTab(round: Round, check: RoundCheck, e: Expectations): GuideTab {
  const f = sheetFormulas(round, check);
  return {
    id: "sheet",
    label: "Spreadsheet",
    steps: [
      {
        n: "1",
        title: "Fetch",
        gist: "this page's CSV, into cell A1",
        expect: { text: e.sheetRows },
        body: (
          <P>
            In Google Sheets, put this in A1: it loads every row of this
            page&apos;s CSV, header first. In Excel, Data › From Web with the
            same address does the same. A sheet set to a locale that writes
            decimals with a comma needs File › Settings › Locale set to United
            States first.
          </P>
        ),
        code: { text: f.importFormula, label: "Import this page's CSV" },
      },
      {
        n: "2",
        title: "Convert",
        gist: "already in ZEC: check each total",
        expect: { text: e.totals },
        body: (
          <P>
            Nothing to divide: the CSV is in ZEC. Columns {f.columns.options}{" "}
            hold Accept, Reject, Reject at a lower amount and Abstain;{" "}
            {f.columns.total} holds the total. Put this in {f.totalCell}2 and
            fill down.
          </P>
        ),
        code: { text: f.totalFormula, label: "Check each total" },
      },
      {
        n: "3",
        title: "Apply ZIP 1016",
        gist: "recompute each outcome from the options",
        expect: { text: e.outcomes },
        body: (
          <P>
            Put this in {f.ruleCell}2 and fill down, then set it beside{" "}
            {f.columns.rule} (the rule outcome) and {f.columns.published} (the
            published one).
          </P>
        ),
        code: { text: f.ruleFormula, label: "Apply ZIP 1016 in the sheet" },
      },
    ],
    note: (
      <>
        This path checks the rule on OpenZcash&apos;s numbers. The curl + jq and
        Python tabs check the numbers themselves against the vote chain.
      </>
    ),
  };
}

function recountStep(
  s: Recount["steps"][number],
  i: number,
  e: Expectations,
  veto: string,
): GuideStep {
  const expect =
    s.result === "tallies"
      ? { text: e.tallies }
      : s.result === "outcomes"
        ? { text: e.outcomes }
        : null;
  return {
    n: String(i + 1),
    title: s.title,
    gist: s.gist,
    expect,
    body: (
      <>
        <P>
          {s.text}
          {s.result === "outcomes" && veto ? ` ${veto}` : ""}
        </P>
        <StepLinks links={s.links} />
      </>
    ),
    code: s.code ? { text: s.code, label: s.title } : undefined,
  };
}

/**
 * How to rebuild the round without this site: for the vote chain, three
 * ways (curl and jq, Python, a spreadsheet); for a Coin Voting round, its
 * recount with the published seeds.
 */
export function Rebuild({
  round,
  check,
  chain,
}: {
  round: Round;
  check: RoundCheck;
  chain: ChainReport | null;
}) {
  const e = expectations(round, check, chain);
  const cmd = chainCommands(round.id);
  if (cmd)
    return (
      <Guide
        id="rebuild"
        title="Rebuild it yourself"
        sub="Fetch, convert and apply ZIP 1016, three ways; each step says what it should print."
        tabs={[
          jqTab(cmd, e, chain),
          pythonTab(cmd, e),
          sheetTab(round, check, e),
        ]}
      />
    );
  const recount = RECOUNTS[round.id];
  if (!recount) return null;
  return (
    <Guide
      id="recount"
      title="Recount it yourself"
      sub="With the seeds the organisers published; each step says what it should give."
      tabs={[
        {
          id: "recount",
          label: "Recount",
          steps: recount.steps.map((s, i) =>
            recountStep(s, i, e, vetoNote(round)),
          ),
        },
      ]}
    />
  );
}
