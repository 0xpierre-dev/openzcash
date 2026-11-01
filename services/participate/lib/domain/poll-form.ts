/** datetime-local controls on voting forms represent UTC, never the device zone. */
export function parsePollUtcInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value
    ? date.toISOString() : null;
}

export function pollCreationMessage(code?: string): string {
  const messages: Record<string, string> = {
    forbidden: "Your session or permissions changed. Sign in again before saving.",
    forbidden_origin: "This page could not be verified. Reopen it and try again.",
    DAO_MEMBER_ALREADY_ACTIVE: "That name or Signal username already belongs to an active member.",
    DAO_MEMBER_NOT_FOUND: "This member is no longer active. Refresh the member list before continuing.",
    DAO_MEMBER_BASKET_EMPTY: "Add the initial members before creating a membership proposal.",
    COMMUNITY_NOT_FOUND: "This community is no longer available to your account.",
    INVALID_POLL_INPUT: "Check the member details and voting dates. Voting must last at least 24 hours."
  };
  return messages[code ?? ""] ?? "The proposal could not be saved. Review the details and try again.";
}
