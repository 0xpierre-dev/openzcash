import { EMPTY_SUBMISSION, saveSubmissionSchema, submissionDraftSchema, submissionPublishableSchema } from "@/lib/domain/proposal-submission";

const complete = { ...EMPTY_SUBMISSION, title: "A proposal for the community", applicant: "Public team", requestedAmountUsd: "1000.00", body: "We will publish a community guide, host two sessions and report on the outcomes, budget and milestones." };

it("allows incomplete private drafts but requires the complete public application", () => {
  expect(submissionDraftSchema.safeParse(EMPTY_SUBMISSION).success).toBe(true);
  expect(submissionPublishableSchema.safeParse(EMPTY_SUBMISSION).success).toBe(false);
});
it.each(["javascript:alert(1)", "http://example.org", "https://user:secret@example.org", "file:///private/file"])("rejects unsafe public links: %s", githubUrl => {
  expect(submissionDraftSchema.safeParse({ ...EMPTY_SUBMISSION, githubUrl }).success).toBe(false);
});
it.each(["-1", "1e6", "5.001", "0", "1,000"])("keeps USD values exact: %s", requestedAmountUsd => {
  expect(submissionDraftSchema.safeParse({ ...EMPTY_SUBMISSION, requestedAmountUsd }).success).toBe(false);
});
it.each(["", "https://forum.zcashcommunity.com/", "https://forum.zcashcommunity.com/u/team", "https://forum.zcashcommunity.com/t/proposal", "https://forum.zcashcommunity.com.evil.invalid/t/proposal/12345", "https://example.org/t/proposal/12345", "https://forum.zcashcommunity.com:8443/t/proposal/12345"])("requires a Zcash forum topic for publication: %s", forumUrl => {
  expect(submissionDraftSchema.safeParse({ ...complete, forumUrl }).success).toBe(true);
  const result = submissionPublishableSchema.safeParse({ ...complete, forumUrl });
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues[0].path).toEqual(["forumUrl"]);
});
it.each(["https://forum.zcashcommunity.com/t/proposal/12345", "https://forum.zcashcommunity.com/t/proposal/12345/8?u=team", "https://forum.zcashcommunity.com/t/12345"])("accepts discussion links without requiring GitHub: %s", forumUrl => {
  expect(submissionPublishableSchema.safeParse({ ...complete, forumUrl, githubUrl: "" }).success).toBe(true);
});
it("rejects client ownership, price, lifecycle and ballot fields", () => {
  const base = { id: "078b0fc7-ae08-4fbf-ac40-6224f23613b4", expectedVersion: 0, payload: EMPTY_SUBMISSION };
  for (const extra of [{ authorId: "other" }, { committeeId: "other" }, { cost: 0 }, { state: "APPROVED" }, { opensAt: "2026-10-10" }]) {
    expect(saveSubmissionSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  }
});
