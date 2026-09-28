/** Fixed reasons a visitor can attach to a "Needs work" vote. A closed list, so feedback stays free of conversation text and can be counted per day and route. */
export const FEEDBACK_REASONS = [
  { id: "wrong_figure", label: "A figure is wrong" },
  { id: "outdated", label: "Out of date" },
  { id: "missing_source", label: "No source or a bad link" },
  { id: "off_question", label: "Did not answer my question" },
  { id: "wrong_language", label: "Wrong language" },
  { id: "unclear", label: "Too long or unclear" },
  { id: "other", label: "Something else" },
] as const;
export type FeedbackReason = typeof FEEDBACK_REASONS[number]["id"];
export const FEEDBACK_REASON_IDS = FEEDBACK_REASONS.map((r) => r.id) as [FeedbackReason, ...FeedbackReason[]];
export const isFeedbackReason = (value: unknown): value is FeedbackReason => typeof value === "string" && (FEEDBACK_REASON_IDS as string[]).includes(value);
