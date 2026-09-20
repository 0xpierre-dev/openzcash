import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The home is the ZCG overview; the treasuries live in the bottom bar. */
export default function HomePage() {
  redirect("/zcg");
}
