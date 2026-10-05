import { LegalPage } from "@/components/legal/page";
import { getLegalFeed } from "@/lib/legal/feed";
import { pageMetadata } from "@/lib/seo/page-metadata";
export const dynamic = "force-dynamic";
export const metadata = pageMetadata({title:"Privacy & Policy · OpenZcash",description:"Privacy, policy and regulation around Zcash. Public PGPZ memos and official sources, organized by region, topic and status.",path:"/legal",card:{kicker:"Privacy · Policy · Rights"}});
export default async function Page() { return <LegalPage feed={await getLegalFeed()}/>; }
