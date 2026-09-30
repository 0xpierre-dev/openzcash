import WalletCatalog from "./catalog";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { HARDWARE, SOFTWARE } from "./catalog-data";
export const dynamic = "force-dynamic";

// The same counts as the page's stat row, from the same static catalog.
const WALLETS = [...SOFTWARE, ...HARDWARE];
const FULL_SHIELDED = WALLETS.filter((w) => w.shielded === "full").length;

export const metadata = pageMetadata({
  title: "Zcash Wallets · OpenZcash",
  description:
    "Self-custody wallets for ZEC. Only shielded (z-address) support makes Zcash private, so prefer a 'Full shielded' wallet.",
  path: "/wallets",
  card: { stat: `${WALLETS.length} wallets · ${FULL_SHIELDED} full shielded` },
});
export default function WalletsPage() {
  return <WalletCatalog />;
}
