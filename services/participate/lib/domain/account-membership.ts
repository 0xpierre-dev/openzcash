const messages: Record<string, string> = {
  forbidden: "Sign in with your account to continue.",
  forbidden_origin: "Reload this page and try again.",
  ACCOUNT_UNAVAILABLE: "Your account is unavailable. Sign in again to continue.",
  COMMUNITY_NOT_FOUND: "This community is no longer available to your account.",
  OWNER_REQUIRED: "Only the community owner can set up the first members.",
  ALREADY_A_MEMBER: "You are already a member. Refresh to see your membership.",
  REQUEST_COOLDOWN: "Please wait before submitting another request. You can reapply 24 hours after your last request was closed.",
  REQUEST_ALREADY_REVIEWED: "This request has changed. Refresh to see its current status.",
  REQUEST_NOT_FOUND: "This request is no longer available to your account.",
  MEMBER_NOT_FOUND: "This member is no longer active. Refresh the member list.",
  MEMBER_IDENTITY_CONFLICT: "This account or name is already on the roster. Existing identities must be linked through a separate verification process.",
  DAO_MEMBER_BOOTSTRAP_LOCKED: "The initial roster is already set up. Refresh to view your members.",
  DAO_MEMBER_BASKET_EMPTY: "An active voting roster is required before creating a membership proposal.",
  INVALID_INITIAL_ROSTER: "Select at least one account for the initial roster.",
  INVALID_MEMBERSHIP_PROPOSAL: "Check the question, selected member and voting dates.",
  MEMBERSHIP_CHANGED: "Another change was saved at the same time. Refresh and try again.",
  REQUEST_KEY_REUSED: "This draft request was already used. Check your proposals before starting another."
};
export function membershipErrorMessage(code?: string) {
  return messages[code ?? ""] ?? "We could not confirm this change. Refresh to check its status before trying again.";
}
