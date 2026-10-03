import { describe, expect, it } from "vitest";
import { comparisons, comparisonsSchema, questionResult, formatVotingWeight, formatVoteShare } from "./comparisons";

const round = comparisons.rounds[0];
describe("governance comparison denominators", () => {
  it("reconciles each question to its own total, including the skipped ZCAP response", () => {
    expect(round.questions.map(question => questionResult(question, "zcap", false).total)).toEqual(["135", "135", "134", "135", "135"]);
    expect(questionResult(round.questions[0], "coinholders", false).total).toBe("2403537000");
    expect(questionResult(round.questions[1], "coinholders", false).total).toBe("2401152000");
  });
  it("recalculates an expressed-preference share without changing the recorded tally", () => {
    const inclusive = questionResult(round.questions[0], "zcap", false), expressed = questionResult(round.questions[0], "zcap", true);
    expect(inclusive.options[0].percent).toBe(42.2);
    expect(expressed.options[0].percent).toBe(47.5);
    expect(expressed.total).toBe("135"); expect(expressed.denominator).toBe("120");
    expect(expressed.options[3].percent).toBeNull();
  });
  it("preserves different voting units and exact fractional ZEC", () => {
    expect(formatVotingWeight("2375932375", 3)).toBe("2,375,932.375");
    expect(formatVotingWeight("57", 0)).toBe("57");
    expect(formatVotingWeight(null, 3)).toBe("Not available");
    expect(round.bodies.map(body => body.unit)).toEqual(["votes", "ZEC"]);
  });
  it("does not manufacture a result from missing values, a zero denominator or a tie", () => {
    const question = structuredClone(round.questions[0]); question.weights.zcap[0] = null;
    expect(questionResult(question, "zcap", false)).toMatchObject({ total: null, denominator: null, leaders: [] });
    question.weights.zcap = ["0", "0", "0", "0"];
    expect(questionResult(question, "zcap", false).options[0].percent).toBeNull();
    question.weights.zcap = ["5", "5", "0", "2"];
    expect(questionResult(question, "zcap", false).leaders).toEqual(["smooth", "halvings"]);
  });
  it("rejects misaligned tallies and unknown bodies before display", () => {
    const copy = structuredClone(comparisons); copy.rounds[0].questions[0].weights.zcap.pop();
    expect(comparisonsSchema.safeParse(copy).success).toBe(false);
    const other = structuredClone(comparisons); other.rounds[0].questions[0].weights.unknown = ["1"];
    expect(comparisonsSchema.safeParse(other).success).toBe(false);
  });
  it("never rounds away a nonzero minority or labels a near-unanimous vote as unanimous", () => {
    expect(formatVoteShare(0, "4", "20000")).toBe("<0.1%");
    expect(formatVoteShare(100, "19999", "20000")).toBe(">99.9%");
    expect(formatVoteShare(100, "20000", "20000")).toBe("100.0%");
    expect(formatVoteShare(0, "0", "20000")).toBe("0.0%");
  });
});
