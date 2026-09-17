/** Detail pages keep the existing query parameters and data. */
export const DESIGN_GROUPS = [
  {
    name: "Funding",
    description: "Follow grants from approval to the last payment.",
    routes: [
      ["/zcg", "Overview"],
      ["/zcg/grants", "Grants"],
      ["/zcg/recipients", "Recipients"],
      ["/zcg/disbursements", "Disbursements"],
      ["/zcg/schedule", "Scheduled payments"],
      ["/zcg/totals", "Totals"],
      ["/zcg/analytics", "Insights"],
      ["/zcg/fpf", "FPF"],
      ["/zcg/coinholder", "Coinholder"],
    ],
  },
  {
    name: "Governance",
    description: "The people, proposals and decisions behind the grants.",
    routes: [
      ["/zcg/proposals", "Proposals"],
      ["/zcg/committee", "Committee"],
      ["/zcg/meetings", "Meetings"],
      ["/zcg/stipends", "Stipends"],
      ["/zcg/budget", "Budget"],
      ["/zcg/office", "ZCG Office"],
    ],
  },
  {
    name: "Treasuries",
    description: "Public balances, movements and source reconciliation.",
    routes: [
      ["/lockbox", "Lockbox"],
      ["/zcg/reconciliation", "Reconciliation"],
      ["/zechub", "ZecHub"],
      ["/zf", "Zcash Foundation"],
      ["/shielded-labs", "Shielded Labs"],
      ["/z3", "Z3"],
    ],
  },
  {
    name: "Ecosystem",
    description: "Discover the projects and communities building on Zcash.",
    routes: [
      ["/ecosystem", "Projects"],
      ["/wallets", "Wallets"],
      ["/communities", "Communities"],
      ["/defi", "DeFi"],
      ["/development", "Development"],
      ["/news", "News"],
      ["/arborist", "Arborist calls"],
    ],
  },
  {
    name: "Research",
    description: "Read the records, consult sources and explore with Copilot.",
    routes: [
      ["/zcg/methodology", "Sources & API"],
      ["/zcg/copilot", "ZCG Copilot"],
      ["/zcg/coinholder/copilot", "Coinholder Copilot"],
      ["/zechub/copilot", "ZecHub Copilot"],
    ],
  },
  {
    name: "Manage",
    description: "Manage this environment using its own administrator access.",
    routes: [
      ["/projects", "Recipients & projects"],
      ["/viewing-keys", "Viewing keys"],
      ["/invites", "Invitations"],
      ["/onboarding", "Register treasury"],
      ["/login", "Sign in"],
    ],
  },
] as const;
export function designGroup(path: string) {
  if (path === "/zcg/grant" || path === "/zcg/recipient")
    return DESIGN_GROUPS[0];
  if (path === "/zcg/maya") return DESIGN_GROUPS[3];
  return DESIGN_GROUPS.find((group) =>
    group.routes.some(([href]) => href === path),
  );
}
