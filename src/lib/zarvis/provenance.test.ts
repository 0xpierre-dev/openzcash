import { describe, expect, it } from "vitest";
import { fallbackNotice, modelLabel, provenanceLabel, retrievedLabel } from "./provenance";
import type { AnswerProvenance } from "./types";
const base: AnswerProvenance = { route: "model", model: "grok-4.7", webSearch: false, groundingFallback: false, withheldFigures: 0, language: "en" };

describe("Provenance badge", () => {
  it("labels direct answers in the answer's language", () => {
    expect(provenanceLabel({ ...base, route: "local", model: null }, 1)).toBe("Direct from OpenZcash data · no AI");
    expect(provenanceLabel({ ...base, route: "local", model: null, language: "pt" }, 1)).toBe("Direto dos dados OpenZcash · sem IA");
  });
  it("names the model, the source count and the check reminder for model answers", () => {
    expect(provenanceLabel(base, 3)).toBe("Grok 4.7 · 3 sources · check them");
    expect(provenanceLabel({ ...base, language: "pt" }, 1)).toBe("Grok 4.7 · 1 fonte · confira");
    expect(provenanceLabel({ ...base, webSearch: true, language: "pt" }, 2)).toBe("Grok 4.7 · busca na web · 2 fontes · confira");
    expect(provenanceLabel({ ...base, model: "gpt-5-mini" }, 0)).toBe("GPT-5 mini · 0 sources · check them");
  });
  it("falls back to the provider label for unknown model ids and never invents one", () => {
    expect(modelLabel("custom-model", "xAI (Grok)")).toBe("custom-model");
    expect(modelLabel(null, "xAI (Grok)")).toBe("xAI (Grok)");
    expect(modelLabel(null, null)).toBe("AI model");
  });
  it("shows the withheld-figures notice only after a grounding fallback", () => {
    expect(fallbackNotice(base)).toBeUndefined();
    expect(fallbackNotice({ ...base, groundingFallback: true, withheldFigures: 2 })).toBe("Some figures could not be verified and were left out.");
    expect(fallbackNotice({ ...base, groundingFallback: true, withheldFigures: 1, language: "pt" })).toBe("Alguns valores não puderam ser verificados e foram omitidos.");
  });
  it("stamps retrieval times with their zone", () => {
    expect(retrievedLabel("2026-09-28T11:36:00Z")).toBe("Retrieved Sep 28, 2026, 11:36 AM UTC");
    expect(retrievedLabel("not a date")).toBeUndefined();
  });
});
