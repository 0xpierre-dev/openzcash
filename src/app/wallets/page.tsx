import WalletCatalog from "./catalog";
export const dynamic = "force-dynamic";
export const metadata = { title: "Zcash Wallets · OpenZcash" };
export default function WalletsPage() {
  return <WalletCatalog />;
}
