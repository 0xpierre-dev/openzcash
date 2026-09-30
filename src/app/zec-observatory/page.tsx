import { getMarketDashboard } from "@/lib/markets/sources";
import { MarketAnalysis } from "./market-analysis";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const dynamic = "force-dynamic";
export const metadata = {
  ...pageMetadata({
    title: "ZEC Observatory · OpenZcash",
    description:
      "Zcash markets, supply and public holdings. Compare CEX and DEX spot volume, track intent activity separately, and inspect on-chain balances and institutional disclosures.",
    path: "/zec-observatory",
  }),
  alternates: { canonical: "https://openzcash.org/zec-observatory" },
};

export default async function MarketsPage() {
  return <MarketAnalysis initial={await getMarketDashboard()} />;
}
