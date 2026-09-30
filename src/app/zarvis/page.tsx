import { ZarvisPage } from "@/components/zarvis/zarvis-chat";
import { pageMetadata } from "@/lib/seo/page-metadata";
export const metadata = pageMetadata({
  title: "Zarvis · Your Zcash guide · OpenZcash",
  description: "Explore Zcash, community funding, treasuries and the ecosystem with Zarvis, OpenZcash's AI guide. Ask in your language and follow the sources.",
  path: "/zarvis",
  card: { title: "Zarvis" },
});
export default function Page() { return <ZarvisPage/>; }
