import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The home is the ZCG overview; the treasuries live in the bar and at /treasury. */
export default function HomePage() {
  redirect("/zcg");
}
