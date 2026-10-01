import {
  VERIFIABLE_ROUNDS,
  findVerifiableRound,
  verifyRound,
} from "@/lib/coinholder/verify";
import {
  chainReport,
  exportFilename,
  verifyCsv,
  verifyJson,
} from "@/lib/coinholder/verify-export";
import { VOTE_CHAIN_ROUNDS } from "@/lib/coinholder/verify-sources";
import { fetchVoteSummary } from "@/lib/coinholder/vote-chain";

// The Q3 round is compared live with the vote chain (cached in-process for an hour).
export const dynamic = "force-dynamic";

const FORMATS = ["json", "csv"] as const;
type Format = (typeof FORMATS)[number];
/** Longest slice of a bad parameter repeated back in an error. */
const ECHO = 40;
const CACHED = "public, max-age=600, stale-while-revalidate=3600";
/** Without the chain comparison, ask again soon. */
const CACHED_BRIEFLY = "public, max-age=60";

const echo = (v: string) => (v.length > ECHO ? `${v.slice(0, ECHO)}…` : v);

function fail(status: number, error: string) {
  return Response.json(
    { error, rounds: VERIFIABLE_ROUNDS.map((r) => r.id) },
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * One round of the Coinholder-Directed Retroactive Grants Program, checked:
 * each question's ZEC per option, ZIP 1016 applied to it, the published
 * outcome, and for a vote-chain round whether the tally equals the chain's
 * finalized summary. ?round=<id> (default: the latest round with a vote),
 * ?format=json|csv. The page is /coinholders/verify.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const format = (params.get("format") ?? "json").trim().toLowerCase();
  if (!FORMATS.includes(format as Format))
    return fail(400, `Unknown format "${echo(format)}": use json or csv.`);
  const requested = params.get("round");
  const round = findVerifiableRound(requested);
  if (!round)
    return fail(
      404,
      `No round with a vote is called "${echo(requested ?? "")}".`,
    );

  const chainRoundId = VOTE_CHAIN_ROUNDS[round.id];
  const live = chainRoundId ? await fetchVoteSummary(chainRoundId) : null;
  const check = verifyRound(round, live?.ok ? live.summary : null);
  const cache = live && !live.ok ? CACHED_BRIEFLY : CACHED;

  if (format === "csv")
    return new Response(verifyCsv(round, check), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(round.id, "csv")}"`,
        "Cache-Control": cache,
      },
    });
  return Response.json(verifyJson(round, check, chainReport(round.id, live)), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `inline; filename="${exportFilename(round.id, "json")}"`,
      "Cache-Control": cache,
    },
  });
}
