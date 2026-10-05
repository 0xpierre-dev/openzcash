import { LegalPage } from "@/components/legal/page";
import { getLegalFeed } from "@/lib/legal/feed";
import { pageMetadata } from "@/lib/seo/page-metadata";
export const dynamic = "force-dynamic";
export const metadata = pageMetadata({title:"PGP · Zcash Legal · OpenZcash",description:"Public policy memos and advocacy from the PGPZ community, with publication dates and original sources.",path:"/legal/pgp",card:{kicker:"The PGPZ policy desk"}});
export default async function Page() { return <LegalPage feed={await getLegalFeed()} pgpOnly/>; }
