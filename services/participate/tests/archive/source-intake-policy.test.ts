import { zcgSourceIntakeSkipReason } from "@/lib/archive/source-intake-policy";

const body = "### Application Owners (@Octocat, @Octocat1)\n\n@applicant\n\n### Requested Grant Amount (USD)\n\n$18,000\n\n### Project Summary\n\nCommunity wallet tools.\n\n### Project Description\n\nDetailed implementation and milestones.";
const issue = { state: "open", title: "Grant Application - Community tools", body, labels: [] as string[] };

describe("official application intake before committee triage", () => {
  it("accepts the complete unlabeled application form, including CRLF, without a ready label", () => {
    expect(zcgSourceIntakeSkipReason(issue)).toBeNull();
    expect(zcgSourceIntakeSkipReason({ ...issue, body: body.replaceAll("\n", "\r\n") })).toBeNull();
    expect(zcgSourceIntakeSkipReason({ ...issue, title: "Community tools", labels: ["📋 Grant Application"] })).toBeNull();
    expect(zcgSourceIntakeSkipReason({ ...issue, title: "Zecboat: Wake v1, a custom Halo 2 circuit for note lineage" })).toBeNull();
  });
  it("preserves intake for explicitly triaged legacy applications", () => {
    expect(zcgSourceIntakeSkipReason({ ...issue, title: "Old format", body: "Original proposal", labels: ["📋 Grant Application", "👀 Ready For ZCG Review"] })).toBeNull();
  });
  it.each(["✅ Grant Approved", "❌ Grant Declined", "Grant Withdrawn by Submitter", "❌ Grant Cancelled Before Completion", "Milestone 1 Complete", "Does not meet criteria"])("does not initially import terminal label %s", label => {
    expect(zcgSourceIntakeSkipReason({ ...issue, labels: [label] })).toBe("SOURCE_NOT_PENDING");
  });
  it("excludes closed issues and pull requests", () => {
    expect(zcgSourceIntakeSkipReason({ ...issue, state: "closed" })).toBe("SOURCE_NOT_PENDING");
    expect(zcgSourceIntakeSkipReason({ ...issue, pullRequest: true })).toBe("SOURCE_NOT_GRANT_APPLICATION");
  });
  it("excludes V12 credits, generic issues and a misleading title with no application", () => {
    expect(zcgSourceIntakeSkipReason({ ...issue, title: "V12 Credits Application - Wallet", labels: ["🛡️ V12 Credits Application"] })).toBe("SOURCE_NOT_GRANT_APPLICATION");
    expect(zcgSourceIntakeSkipReason({ ...issue, title: "A question about grants", body: "Where do I apply?" })).toBe("SOURCE_NOT_GRANT_APPLICATION");
    expect(zcgSourceIntakeSkipReason({ ...issue, title: "V12 Credits Application - Wallet" })).toBe("SOURCE_NOT_GRANT_APPLICATION");
    expect(zcgSourceIntakeSkipReason({ ...issue, body: "Please fund this." })).toBe("SOURCE_APPLICATION_TEMPLATE_INCOMPLETE");
  });
  it("does not interpret quoted templates or empty required fields as a submitted application", () => {
    for (const input of ["<!--\n" + body + "\n-->", "> " + body.replaceAll("\n", "\n> "), "```markdown\n" + body + "\n```", "~~~~markdown\n" + body + "\n~~~~", body.replace("Community wallet tools.", "_No response_"), body.replace("@applicant", ""), body.replace("$18,000", "")]) {
      expect(zcgSourceIntakeSkipReason({ ...issue, body: input })).toBe("SOURCE_APPLICATION_TEMPLATE_INCOMPLETE");
      expect(zcgSourceIntakeSkipReason({ ...issue, title: "Custom project title", body: input })).toBe("SOURCE_NOT_GRANT_APPLICATION");
    }
  });
});
