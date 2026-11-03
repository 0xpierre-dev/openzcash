// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Proposals } from "./proposals";
import type { Q4ProposalSummary } from "@/lib/coinholder/q4";
import { TOPIC_ANALYSIS_VERSION } from "@/lib/coinholder/proposal-topics";

// Match Next's documented native History API integration with useSearchParams.
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (callback: () => void) => {
    window.addEventListener("popstate", callback);
    return () => window.removeEventListener("popstate", callback);
  };
  return { useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)) };
});
beforeEach(() => {
  window.history.replaceState(null, "", "/coinholders/proposals");
  const replace = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, "replaceState").mockImplementation((...args) => {
    replace(...args);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const base = { applicant: "example", organization: null, summary: "Completed work", createdAt: "2026-10-30T12:00:00Z", updatedAt: "2026-10-30T13:00:00Z", url: "https://github.com/example" };
const proposals: Q4ProposalSummary[] = [
  { ...base, number: 70, title: "Maya integration", organization: "Maya Protocol", category: "Integration", requestedUsdCents: 5000000 },
  { ...base, number: 69, title: "Zebra research", category: "Research", requestedUsdCents: 7500000 },
  { ...base, number: 71, title: "Unspecified request", category: null, requestedUsdCents: null },
];
describe("Q4 proposal exploration", () => {
  it("restores search, topic and sort when returning to the filtered URL", () => {
    const view = render(<Proposals proposals={proposals} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Zebra" } });
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Research" } });
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "highest" } });
    const saved = window.location.href;
    view.unmount();
    window.history.replaceState(null, "", "/coinholders/proposals/69");
    window.history.replaceState(null, "", saved);
    render(<Proposals proposals={proposals} />);
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("Zebra");
    expect((screen.getByLabelText("Topic") as HTMLSelectElement).value).toBe("Research");
    expect((screen.getByLabelText("Sort") as HTMLSelectElement).value).toBe("highest");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(window.location.search).toBe("?sort=highest");
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });
  it("ignores unknown topic and sort parameters in a shared link", () => {
    window.history.replaceState(null, "", "/coinholders/proposals?topic=removed&sort=bad");
    render(<Proposals proposals={proposals} />);
    expect((screen.getByLabelText("Topic") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Sort") as HTMLSelectElement).value).toBe("newest");
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });
  it("filters by the displayed security topic and keeps source categories searchable", () => {
    const securityProposal = { ...proposals[1], title: "Zebra DoS (CVE-2026-44499)", category: "Research & Development" };
    render(<Proposals proposals={[proposals[0], securityProposal]} />);
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Security research" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByTitle("Source category: Research & Development").textContent).toBe("Security research");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Research & Development" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Security research" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("link", { name: `View proposal : ${securityProposal.title}` }).getAttribute("href")).toBe("/coinholders/proposals/69");
    expect(securityProposal.category).toBe("Research & Development");
  });
  it("keeps the full amount and cents for large requests", () => {
    render(<Proposals proposals={[{ ...proposals[0], requestedUsdCents: 123456789 }]} />);
    expect(screen.getByText("$1,234,567.89")).toBeTruthy();
  });
  it("combines search and category and lets the reader clear an empty search", () => {
    render(<Proposals proposals={proposals} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Maya Protocol" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Research" } });
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByText("No matching proposals")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });
  it("sorts numeric requests and keeps missing amounts last", () => {
    render(<Proposals proposals={proposals} />);
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "highest" } });
    let articles = screen.getAllByRole("article");
    expect(within(articles[0]).getByText("Zebra research")).toBeTruthy();
    expect(within(articles[2]).getByText("Not specified")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "lowest" } });
    articles = screen.getAllByRole("article");
    expect(within(articles[0]).getByText("Maya integration")).toBeTruthy();
    expect(within(articles[2]).getByText("Not specified")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Maya integration" }).getAttribute("href")).toBe("/coinholders/proposals/70");
  });
  it("renders multiple evidenced topics and filters by a secondary tag", () => {
    render(<Proposals proposals={[proposals[0], { ...proposals[1], topicAnalysis: {
      version: TOPIC_ANALYSIS_VERSION, model: "gpt-5-mini", analyzedAt: "2026-11-01T12:00:00Z",
      tags: [{ id: "security-research", confidence: 0.98, evidence: "We responsibly disclosed the Zebra vulnerability." }, { id: "bug-bounty", confidence: 0.95, evidence: "We request bounty-equivalent retroactive compensation." }],
    } }]} />);
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Bug bounty" } });
    const article = screen.getByRole("article");
    expect(within(article).getByText("Security research")).toBeTruthy();
    expect(within(article).getByText("Bug bounty").getAttribute("title")).toContain("bounty-equivalent");
    expect(within(article).getByText("$75,000")).toBeTruthy();
  });
});
