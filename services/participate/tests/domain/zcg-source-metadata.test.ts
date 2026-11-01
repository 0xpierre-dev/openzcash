import sourceSnapshot from "@/data/zcg-source-metadata.json";
import { ZCG_SOURCE_METADATA, zcgSourceMetadata, zcgSourceWithdrawal } from "@/lib/data/zcg-source-metadata";
import { classifyZcgSectors, githubProposalOutcome, readZcgSourceCategory, readZcgSourceRequestedUsd, sourceCategoryTag, zcgCurrentStatusLabel, zcgSourceMetadataSchema } from "@/lib/domain/zcg-source-metadata";
import { ZCG_REVIEW_PROPOSALS } from "@/lib/data/zcg-review-proposals";
import { ZCG_PROPOSAL_EXAMPLES } from "@/lib/data/zcg-proposal-examples";

it("maps all 25 proposals to the exact source issue and keeps historical resubmissions distinct", () => {
  expect(ZCG_SOURCE_METADATA).toHaveLength(25);
  for (const proposal of [...ZCG_REVIEW_PROPOSALS, ...ZCG_PROPOSAL_EXAMPLES]) expect(zcgSourceMetadata(proposal.id)).toBeDefined();
  expect(zcgSourceMetadata("zcg-seedsigner-2026-09-14")?.issueNumber).toBe(411); // $65k original, not the later $30k resubmission.
  expect(zcgSourceMetadata("zcg-arabia-2026-08-31")?.issueNumber).toBe(400); // Approved revision, not the declined issue 380.
  expect(zcgSourceMetadata("native-unrelated-record")).toBeUndefined();
});

it("applies source withdrawal only to the matching imported application snapshot", () => {
  expect(zcgSourceWithdrawal({ recordId: "zcg-github-439", kind: "REVIEW_SNAPSHOT" })).toMatchObject({ url: "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/439" });
  for (const kind of ["NATIVE_PROPOSAL", "HISTORICAL_SUMMARY"]) expect(zcgSourceWithdrawal({ recordId: "zcg-github-439", kind })).toBeNull();
  expect(zcgSourceWithdrawal({ recordId: "zcg-github-478", kind: "REVIEW_SNAPSHOT" })).toBeNull();
  expect(zcgSourceWithdrawal({ recordId: "unrelated-proposal", kind: "REVIEW_SNAPSHOT" })).toBeNull();
});

it("keeps the declared category and adds deduplicated, bounded sector suggestions", () => {
  expect(classifyZcgSectors("Travel Support for Devcon 8 Mumbai", "Education", ["events"])).toEqual(["education", "events"]);
  expect(classifyZcgSectors("VKX Wallet integration", "Wallets", ["wallets", "integration"])).toEqual(["wallets", "integration"]);
  expect(sourceCategoryTag("Non-Wallet Applications")).toBe("applications");
  expect(classifyZcgSectors("Formal verification research", "Security", ["research", "protocol"])).toEqual(["security", "research", "protocol"]);
  expect(classifyZcgSectors("Unclassified project", "Unrecognized category", ["nonexistent"])).toEqual([]);
  expect(classifyZcgSectors("Zcash documentation", null, [])).toEqual(["education"]);
});

it.each([
  ["### Category\n\nInfrastructure\n\n### Project Summary\nA local bridge.", "Infrastructure"],
  ["### Proposal Category\r\n\r\nWallets\r\n", "Wallets"],
  ["### Category\nEducation", "Education"],
  ["### Category\n \t\nIntegration  \n", "Integration"],
  ["### Category\n\n_No response_\n\n### Project Summary\nInfrastructure", null],
  ["### Category\n\n### Project Summary\nInfrastructure", null],
  ["### Category\n\n", null],
  ["### Category details\n\nInfrastructure", null],
  ["### Category\n\n" + "a".repeat(201), null],
  ["```markdown\n### Category\n\nSecurity\n```\n\n### Category\n\nInfrastructure", "Infrastructure"],
  ["### Category\n\n```\nInfrastructure\n```", null]
])("reads only an explicit category value from the source template", (markdown, expected) => {
  expect(readZcgSourceCategory(markdown)).toBe(expected);
});

it("classifies the actual bridge template's declared category without guessing from its name", () => {
  const category = readZcgSourceCategory("### Category\n\nInfrastructure\n\n### Project Summary\nA local bridge.");
  expect(classifyZcgSectors("Grant Application - Zcash Private Receive Bridge", category, [])).toEqual(["infrastructure"]);
});

it.each([
  ["$38,000", 38000], ["38000", 38000], ["38000.25", 38000.25], ["$38,000.25 USD", 38000.25],
  ["0", 0], ["$0.00", 0], ["100,000,000.00", 100_000_000], ["1.5", 1.5]
])("reads the exact requested-USD field %s", (value, expected) => {
  expect(readZcgSourceRequestedUsd(`### Requested Grant Amount (USD)\r\n\r\n${value}\r\n\r\n### Category\r\n\r\nInfrastructure`)).toBe(expected);
});

it.each([
  "38,00", "38.000,25", "38000,25", "$38,000–$40,000", "$38,000 USD or 30 ZEC", "approximately $38,000", "-38000", "+38000",
  "100,000,000.01", "38000.001", "€38,000", "38000 EUR", "R$38,000", "38k", "3.8e4", "_No response_", "038000", "38,000\nMore money later", ""
])("does not infer a requested amount from ambiguous input %j", value => {
  expect(readZcgSourceRequestedUsd(`### Requested Grant Amount (USD)\n\n${value}\n\n### Category\n\nInfrastructure`)).toBeNull();
});

it("does not substitute other budget fields, source prose, or a fenced example for the requested amount", () => {
  expect(readZcgSourceRequestedUsd("### Total Budget (USD)\n\n$38,000\n\n### Milestone Details\n\n$38,000")).toBeNull();
  expect(readZcgSourceRequestedUsd("The requested grant amount (USD) is $38,000.")).toBeNull();
  expect(readZcgSourceRequestedUsd("```markdown\n### Requested Grant Amount (USD)\n\n$38,000\n```")).toBeNull();
  expect(readZcgSourceRequestedUsd("### Requested Grant Amount (USD)\n\n### Total Budget (USD)\n\n$38,000")).toBeNull();
});

it("honors terminal labels even when GitHub leaves the review label applied", () => {
  expect(githubProposalOutcome(zcgSourceMetadata("zcg-github-439")!)).toBe("abandoned");
  expect(githubProposalOutcome(zcgSourceMetadata("zcg-graphsense-2026-09-28")!)).toBe("approved");
  expect(githubProposalOutcome(zcgSourceMetadata("zcg-seedsigner-2026-09-14")!)).toBe("rejected");
  expect(githubProposalOutcome(zcgSourceMetadata("zcg-github-478")!)).toBe("under_review");
  expect(githubProposalOutcome({ ...zcgSourceMetadata("zcg-github-478")!, state: "closed" })).toBe("closed");
});

it("selects one matching official status instead of a past review step, and permits an honest fallback", () => {
  const approved = zcgSourceMetadata("zcg-graphsense-2026-09-28")!;
  expect(zcgCurrentStatusLabel(approved, "approved")).toBe(approved.labels.find(label => label.name === "✅ Grant Approved"));
  expect(zcgCurrentStatusLabel(zcgSourceMetadata("zcg-github-439"), "abandoned")?.name).toMatch(/Withdrawn/);
  expect(zcgCurrentStatusLabel(zcgSourceMetadata("zcg-github-478"), "under_review")?.name).toBe("👀 Ready For ZCG Review");
  expect(zcgCurrentStatusLabel({ ...approved, labels: [] }, "approved")).toBeNull();
  expect(zcgCurrentStatusLabel(undefined, "rejected")).toBeNull();
});

it.each(["wrong issue", "external url", "bad color", "duplicate label", "duplicate issue"])("rejects %s source metadata", variant => {
  const changed = structuredClone(sourceSnapshot);
  if (variant === "wrong issue") changed.proposals[0].issueNumber = 999;
  if (variant === "external url") changed.proposals[0].url = "https://example.com/478";
  if (variant === "bad color") changed.proposals[0].labels[0].color = "url(javascript:bad)";
  if (variant === "duplicate label") changed.proposals[0].labels.push(changed.proposals[0].labels[0]);
  if (variant === "duplicate issue") changed.proposals.push(changed.proposals[0]);
  expect(() => zcgSourceMetadataSchema.parse(changed)).toThrow();
});
