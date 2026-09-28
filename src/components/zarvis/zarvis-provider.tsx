"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AnswerProvenance, ZarvisEvent, ZarvisExpression, ZarvisSource, ZarvisStatus } from "@/lib/zarvis/types";
import { sessionPreferences, type ZarvisSession } from "@/lib/zarvis/session";
import { answerExpression, completionExpression, progressExpression } from "@/lib/zarvis/expression";
import type { ResponseDepth } from "@/lib/zarvis/depth";
import { conversationContext, MAX_QUESTION_LENGTH } from "@/lib/zarvis/context";

export type DisplayMessage = {
  id: string; role: "user" | "assistant"; content: string;
  feedbackToken?: string; session?: ZarvisSession; sources?: ZarvisSource[]; provenance?: AnswerProvenance; incomplete?: boolean; pose?: ZarvisExpression;
};
type ChatState = {
  messages: DisplayMessage[]; draft: string; setDraft: (value: string) => void;
  depth: ResponseDepth; setDepth: (value: ResponseDepth) => void;
  motionPaused: boolean; toggleMotion: () => void;
  busy: boolean; expression: ZarvisExpression; progress: string; error: string | null; status: ZarvisStatus | null;
  degraded: boolean; retryAt: number | null;
  send: (question?: string, retry?: boolean) => void;
  stop: () => void; clear: () => void; checkStatus: (force?: boolean) => void;
};
const Context = createContext<ChatState | null>(null);
export const portugueseBrowser = () => typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("pt");
/** Honours the server's Retry-After on a 429 so a visitor is told when to come back instead of blindly retrying. */
export function retryHint(seconds: number, pt = portugueseBrowser()): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return pt ? `Tente novamente em ${minutes} minuto${minutes === 1 ? "" : "s"}.` : `Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
export function useZarvis() {
  const context = useContext(Context);
  if (!context) throw new Error("Zarvis provider missing");
  return context;
}

export function ZarvisProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [replying, setReplying] = useState(false);
  const [depth, setDepth] = useState<ResponseDepth>("auto");
  const [motionPaused, setMotionPaused] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ZarvisStatus | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const active = useRef<AbortController | null>(null);
  const statusChecked = useRef(false);
  const checkStatus = useCallback((force = false) => {
    if (statusChecked.current && !force) return;
    statusChecked.current = true;
    fetch("/api/zarvis", { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error();
      setStatus(await r.json());
    }).catch(() => {
      statusChecked.current = false;
      setError("Zarvis is temporarily unavailable. Please try again shortly.");
    });
    // Public health only carries booleans and timestamps; a failed probe never blocks the chat.
    fetch("/api/zarvis/health", { cache: "no-store" }).then(async (r) => { if (r.ok) setDegraded(Boolean((await r.json()).degraded)); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (retryAt === null) return;
    const timer = setTimeout(() => setRetryAt(null), Math.max(0, retryAt - Date.now()));
    return () => clearTimeout(timer);
  }, [retryAt]);
  useEffect(() => {
    const visibility = () => setPageHidden(document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      active.current?.abort();
    };
  }, []);

  function clear() {
    active.current?.abort(); active.current = null;
    setMessages([]); setDraft(""); setError(null); setBusy(false); setReplying(false); setProgress("");
    statusChecked.current = false; checkStatus();
  }
  function stop() { active.current?.abort(); }
  async function send(question?: string, retry = false) {
    if (active.current || !status?.available || (retryAt !== null && Date.now() < retryAt)) return;
    const questionText = (question ?? draft).trim();
    if (!retry && (!questionText || questionText.length > MAX_QUESTION_LENGTH)) return;
    let history = messages.filter((m) => m.content.trim());
    if (retry) {
      const lastUser = messages.findLastIndex((m) => m.role === "user");
      if (lastUser < 0) return;
      history = messages.slice(0, lastUser + 1).filter((m) => m.content.trim());
    } else {
      history = [...history, { id: crypto.randomUUID(), role: "user", content: questionText }];
    }
    const context = conversationContext(history);
    const session = sessionPreferences(history.findLast((message) => message.session)?.session ?? {}, history);
    const id = crypto.randomUUID();
    const controller = new AbortController(); active.current = controller;
    setMessages([...history, { id, role: "assistant", content: "", incomplete: true, pose: answerExpression(history.findLast((message) => message.role === "user")?.content ?? questionText) }]);
    setDraft(""); setBusy(true); setReplying(false); setError(null); setProgress("Reading your question…");
    let completed = false;
    const update = (patch: Partial<DisplayMessage>) => setMessages((all) => all.map((m) => m.id === id ? { ...m, ...patch } : m));
    try {
      const response = await fetch("/api/zarvis", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: context.map(({ role, content }) => ({ role, content })), session, depth }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const wait = response.status === 429 ? Number(response.headers.get("retry-after")) : NaN;
        if (Number.isFinite(wait) && wait > 0) { setRetryAt(Date.now() + wait * 1000); throw new Error(`${data.error ?? "Zarvis could not respond."} ${retryHint(wait)}`); }
        throw new Error(data.error ?? "Zarvis could not respond. Please try again.");
      }
      if (!response.body) throw new Error("The connection ended. Please retry.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder(); let buffer = ""; let text = "";
      const receive = (line: string) => {
        if (!line.trim()) return;
        const event: ZarvisEvent = JSON.parse(line);
        if (event.type === "status") { setProgress(event.message); setReplying(false); }
        if (event.type === "delta") { setReplying(true); setProgress("Writing an answer…"); text += event.text; update({ content: text }); }
        if (event.type === "session") update({ session: event.session });
        if (event.type === "replace") { setReplying(true); text = event.text; update({ content: text }); }
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "done") {
          completed = true; update({ sources: event.sources, provenance: event.provenance, feedbackToken: event.feedbackToken, incomplete: false, pose: completionExpression(history.findLast((m) => m.role === "user")?.content ?? questionText, text) });
        }
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (active.current !== controller) return;
          if (done) { buffer += decoder.decode(); if (buffer) receive(buffer); break; }
          buffer += decoder.decode(value, { stream: true });
          if (buffer.length > 100_000) throw new Error("The response was too large. Please retry.");
          const lines = buffer.split("\n"); buffer = lines.pop()!;
          lines.forEach(receive);
        }
      } finally { reader.releaseLock(); }
      if (!completed) throw new Error("The connection ended before the answer was complete. Please retry.");
    } catch (e) {
      if (active.current !== controller) return;
      setError(controller.signal.aborted ? "Response stopped. You can retry or ask another question." : e instanceof Error ? e.message : "Zarvis could not respond. Please retry.");
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); setProgress(""); }
    }
  }
  // Expressions follow actual chat events; completed answers are not verification badges.
  const answerPose = messages.findLast((message) => message.role === "assistant")?.pose ?? "explaining";
  const expression: ZarvisExpression = busy ? (replying ? answerPose : progressExpression(progress))
    : error ? "error" : draft.trim() ? "listening" : "idle";
  return <Context.Provider value={{ messages, draft, setDraft, depth, setDepth, busy, expression, motionPaused: motionPaused || pageHidden, toggleMotion: () => setMotionPaused((paused) => !paused), progress, error, status, degraded, retryAt, send, stop, clear, checkStatus }}>{children}</Context.Provider>;
}
