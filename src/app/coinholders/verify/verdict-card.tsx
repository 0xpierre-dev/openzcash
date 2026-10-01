import { formatZec } from "@/lib/coinholder/derive";
import type { RoundCheck } from "@/lib/coinholder/verify";
import {
  exportFilename,
  type ChainReport,
} from "@/lib/coinholder/verify-export";
import {
  RECOUNTS,
  SCRIPT_NAME,
  SCRIPT_PATH,
  VOTE_CHAIN_HOSTS,
  VOTE_CHAIN_ROUNDS,
  verifyApiPath,
  voteSummaryUrl,
} from "@/lib/coinholder/verify-sources";
import {
  abbreviateHash,
  hostOf,
  summaryLine,
  utcTime,
  verdictChecks,
  verdictOf,
  type CheckMark,
} from "@/lib/coinholder/verify-view";
import type { Round } from "@/lib/coinholder/types";
import { HashChip } from "./hash-chip";
import shared from "../coinholders.module.css";
import styles from "./verify.module.css";

const MARK: Record<CheckMark, { glyph: string; say: string }> = {
  ok: { glyph: "✓", say: "Passes:" },
  bad: { glyph: "✕", say: "Fails:" },
  quiet: { glyph: "○", say: "" },
  source: { glyph: "○", say: "" },
};

function Downloads({ round }: { round: Round }) {
  const chainId = VOTE_CHAIN_ROUNDS[round.id];
  const recount = RECOUNTS[round.id];
  return (
    <p className={`${shared.roundLinks} ${styles.verdictLinks}`}>
      <a
        href={verifyApiPath(round.id, "csv")}
        download={exportFilename(round.id, "csv")}
      >
        CSV ↓
      </a>
      <a
        href={verifyApiPath(round.id, "json")}
        download={exportFilename(round.id, "json")}
      >
        JSON ↓
      </a>
      {chainId ? (
        <>
          <a
            href={voteSummaryUrl(VOTE_CHAIN_HOSTS[0].origin, chainId)}
            target="_blank"
            rel="noreferrer"
          >
            Raw tally (Valar) ↗
          </a>
          <a
            href={voteSummaryUrl(VOTE_CHAIN_HOSTS[1].origin, chainId)}
            target="_blank"
            rel="noreferrer"
          >
            ZF mirror ↗
          </a>
          <a href={SCRIPT_PATH} download={SCRIPT_NAME}>
            Script (.py) ↓
          </a>
        </>
      ) : (
        recount?.links.map((l) => (
          <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
            {l.label} ↗
          </a>
        ))
      )}
    </p>
  );
}

/** The hash, host, size and time of the live fetch; or, when the chain did not answer, who was asked and when. */
function Proof({ chain }: { chain: ChainReport }) {
  if (chain.status === "unavailable")
    return (
      <p className={styles.proof}>
        Asked {chain.servers.map(hostOf).join(" and ")} at{" "}
        {utcTime(chain.checkedAt)}; neither answered. The steps below fetch it
        directly.
      </p>
    );
  return (
    <p className={styles.proof}>
      <HashChip
        hash={chain.sha256}
        short={abbreviateHash(chain.sha256)}
        about={`SHA-256 of the raw response from ${hostOf(chain.host)}`}
      />
      {/* Each part wraps as a whole, its "·" kept at the end of the line. */}
      <span>
        <span className={styles.proofPart}>from {chain.hostName}</span>{" "}
        <span className={styles.proofPart}>({hostOf(chain.host)}) ·</span>{" "}
        <span className={styles.proofPart}>
          {formatZec(chain.bytes)} bytes ·
        </span>{" "}
        <span className={styles.proofPart}>
          fetched {utcTime(chain.fetchedAt)}
        </span>
      </span>
    </p>
  );
}

/**
 * The round's verdict: how many results check out, the three checks behind
 * it, what the figures show, the hash of what was compared and the downloads.
 */
export function VerdictCard({
  round,
  check,
  chain,
  program,
}: {
  round: Round;
  check: RoundCheck;
  chain: ChainReport | null;
  /** The program's name as the sidebar gives it. */
  program: string;
}) {
  const verdict = verdictOf(check, chain);
  const checks = verdictChecks(round, check, chain);
  return (
    <section className={styles.verdictCard} aria-labelledby="checked">
      <div className={styles.verdictBody}>
        <p className={styles.verdictKicker}>
          {round.label} · {program}
        </p>
        <h2 id="checked" className={styles.verdictTitle}>
          <span
            className={styles.verdictCount}
            data-positive={verdict.positive || undefined}
          >
            {verdict.count}
          </span>{" "}
          {verdict.rest}
        </h2>
        {verdict.failLine ? (
          <p className={styles.verdictFail}>{verdict.failLine}</p>
        ) : null}
        <ul className={styles.checks} aria-label="Checks">
          {checks.map((c) => (
            <li key={c.text} data-mark={c.mark}>
              <span className={styles.checkLine}>
                <span className={styles.checkMark} aria-hidden>
                  {MARK[c.mark].glyph}
                </span>
                {MARK[c.mark].say ? (
                  <span className="sr-only">{MARK[c.mark].say} </span>
                ) : null}
                {c.href ? (
                  <a href={c.href} target="_blank" rel="noreferrer">
                    {c.text} ↗
                  </a>
                ) : (
                  c.text
                )}
              </span>
              <span className={styles.checkSub}>{c.sub}</span>
            </li>
          ))}
        </ul>
        <p className={styles.verdictSummary}>
          {summaryLine(round, check, chain)}
        </p>
        {chain ? <Proof chain={chain} /> : null}
      </div>
      <Downloads round={round} />
    </section>
  );
}
