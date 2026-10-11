export type WorkspaceVotePreview = {
  outcome: "approved" | "rejected" | "ongoing";
  yes: number;
  no: number;
  eligible: number;
};

const PREVIEWS: readonly WorkspaceVotePreview[] = [
  { outcome: "approved", yes: 10, no: 2, eligible: 12 },
  { outcome: "rejected", yes: 3, no: 9, eligible: 12 },
  { outcome: "ongoing", yes: 5, no: 2, eligible: 12 }
];

/** Presentation fixtures only; never a source of actual ballot results. */
export function getWorkspaceVotePreview(index: number, enabled: boolean): WorkspaceVotePreview | null {
  if (enabled !== true || !Number.isInteger(index) || index < 0 || index >= PREVIEWS.length) return null;
  return { ...PREVIEWS[index] };
}
