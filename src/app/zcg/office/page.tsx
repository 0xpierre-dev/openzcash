import { officeUnderReview } from "@/lib/zcg/proposals-repo";
import { OfficeCanvas } from "./office-canvas";
import { OfficeEntrance } from "./office-entrance";
import { officeMembers } from "../current-committee-data";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({
  title: "ZCG Office · OpenZcash",
  description:
    "A living 3D office where every ZCG proposal under review walks the floor as a zebra, in front of the committee.",
  path: "/zcg/office",
});

// One source for the committee: the seats, avatars and captions come from the
// same source-linked record as /zcg/committee (current-committee-data.ts).
const MEMBERS = officeMembers();

export default async function OfficePage() {
  // Initial snapshot; the scene then polls /api/zcg/office to stay live.
  const proposals = await officeUnderReview(100);

  return (
    <OfficeEntrance members={MEMBERS} proposalsCount={proposals.length}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          ZCG Office
        </h1>
        <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-500/25">
          3D · beta
        </span>
      </div>

      <div className="relative h-[78vh] w-full overflow-hidden rounded-2xl border border-stone-200 bg-[#dce3ec] shadow-xl shadow-stone-300/40">
        <OfficeCanvas members={MEMBERS} proposals={proposals} />
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-stone-600">
        Each zebra is a grant proposal under review. Status changes appear the
        next day (Brasília time), based on GitHub and the official spreadsheet.
        Click a proposal to see its summary and application date. Drag to orbit,
        scroll to zoom. Credits: 3D model{" "}
        <a
          href="https://sketchfab.com/3d-models/cartoon-zebra-with-7-animations-c77056f81b564805a1001f3933d5d0fc"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-stone-300 underline-offset-2 hover:text-stone-600"
        >
          “Cartoon Zebra with 7 animations”
        </a>{" "}
        by{" "}
        <a
          href="https://sketchfab.com/jungle_jim"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-stone-300 underline-offset-2 hover:text-stone-600"
        >
          Jungle Jim
        </a>
        , licensed{" "}
        <a
          href="http://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-stone-300 underline-offset-2 hover:text-stone-600"
        >
          CC-BY 4.0
        </a>{" "}
        (modified: compressed, re-scaled, instanced). Low-poly furniture by
        Kenney (CC0) via the open-source Claw3D project (MIT).
      </p>
    </OfficeEntrance>
  );
}
