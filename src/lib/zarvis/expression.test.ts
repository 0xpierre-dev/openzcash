import { describe, expect, it } from "vitest";
import { completionExpression, progressExpression, welcomeExpression } from "./expression";
describe("Mascot reactions follow the response", () => {
  it.each(["I cannot verify the current activation.", "Não consegui confirmar esse valor.", "Não foi possível obter os saldos necessários."])("does not celebrate an unavailable answer: %s", (answer) => expect(completionExpression("Zcash?", answer)).toBe("uncertain"));
  it("recognizes an actual clarification and a comparative explanation", () => {
    expect(completionExpression("Is it active?", "Which network do you mean?")).toBe("clarifying");
    expect(completionExpression("Analyze this", "Compare the scenarios under the same budget.")).toBe("comparing");
    expect(completionExpression("hello", "Zcash is a digital currency.")).not.toBe("pleased");
    expect(progressExpression("Analyzing the scenario…")).toBe("comparing");
  });
});
describe("Welcome mascot", () => {
  it("lands in the neutral pose, then holds the shield while the chat is idle", () => {
    expect(welcomeExpression("landing", false, "idle")).toBe("idle");
    expect(welcomeExpression("raising", false, "idle")).toBe("protecting");
    expect(welcomeExpression("settled", false, "idle")).toBe("protecting");
    // Typing a draft uses the same artwork as idle, so the shield stays up.
    expect(welcomeExpression("settled", false, "listening")).toBe("protecting");
  });
  it("still shows the other live expressions", () => {
    expect(welcomeExpression("settled", false, "thinking")).toBe("thinking");
    expect(welcomeExpression("settled", false, "error")).toBe("error");
    expect(welcomeExpression("landing", false, "explaining")).toBe("explaining");
  });
  it("waves only when asked, over anything else", () => {
    expect(welcomeExpression("landing", true, "idle")).toBe("greeting");
    expect(welcomeExpression("settled", true, "error")).toBe("greeting");
  });
});
