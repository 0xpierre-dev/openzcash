import { PROGRAM } from "@/lib/coinholder/program";
import { currentZecUsdQuote } from "@/lib/pricing/live-price";
import { OverviewView } from "./round-view";

export const dynamic = "force-dynamic";
export const metadata = {
  title: `${PROGRAM.officialName} · OpenZcash`,
  description: `Overview and insights for the ${PROGRAM.officialName}: the value of the ZEC behind each vote, participation, approval and how the rules evolved across every round.`,
};

export default async function CoinholdersPage() {
  const quote = await currentZecUsdQuote();
  return (
    <OverviewView
      today={quote ? { usd: quote.cents / 100, source: quote.source } : null}
    />
  );
}
