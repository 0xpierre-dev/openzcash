import type { ZarvisSession } from "./session";
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ZarvisSource = { title: string; url: string; retrievedAt?: string };
/** Where an answer came from: counts and labels only, never withheld text. `language` is the language of the deterministic parts and of the badge: only English and Portuguese templates exist, so a Spanish or French answer (`answerLanguage` "other") is labelled in English, the interface language. */
export type AnswerProvenance = { route: "local" | "model"; model: string | null; webSearch: boolean; groundingFallback: boolean; withheldFigures: number; language: "en" | "pt" };
export type ZarvisEvent =
  | { type: "session"; session: ZarvisSession }
  | { type: "status"; message: string }
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "done"; sources: ZarvisSource[]; provenance: AnswerProvenance; feedbackToken?: string }
  | { type: "error"; message: string };
export type ZarvisStatus = { available: boolean; provider: "OpenAI" | "xAI (Grok)"; webSearch: boolean };

export type ZarvisExpression = "idle" | "listening" | "thinking" | "explaining" | "error" | "greeting" | "pleased" | "reading" | "exploring" | "protecting" | "comparing" | "uncertain" | "clarifying";
