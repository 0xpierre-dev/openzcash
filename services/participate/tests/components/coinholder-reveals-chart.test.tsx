import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { CoinholderRevealsChart } from "@/components/coinholder-reveals-chart";
import type { CoinholderRevealBucket, CoinholderRevealCounts, CoinholderRevealHistory } from "@/lib/domain/coinholder-reveals";

const DAY = 86_400_000;
const START = Date.parse("2026-09-20T00:00:00Z");
const counts = (accept: number, reject: number, lower: number, abstain: number): CoinholderRevealCounts => ({ accept, reject, lower, abstain });
const sum = (value: CoinholderRevealCounts) => Object.values(value).reduce((total, count) => total + count, 0);

/** Small synthetic counts exercise interactions without implying ZEC weight. */
function days(values: CoinholderRevealCounts[]): CoinholderRevealBucket[] {
  let cumulative = counts(0, 0, 0, 0);
  return values.map((value, index) => {
    cumulative = counts(cumulative.accept + value.accept, cumulative.reject + value.reject, cumulative.lower + value.lower, cumulative.abstain + value.abstain);
    return { at: new Date(START + index * DAY).toISOString(), until: new Date(START + (index + 1) * DAY).toISOString(), counts: value, cumulative, total: sum(value), cumulativeTotal: sum(cumulative) };
  });
}

function historyFixture(): CoinholderRevealHistory {
  return {
    unit: "revealed shares", interval: "day", complete: true, fetchedAt: "2026-10-09T05:06:55Z",
    sourceUrl: "https://prod.explorer-rpc.valargroup.org", sha256: "test-only",
    days: days([counts(3, 1, 1, 0), counts(0, 0, 0, 0), counts(1, 4, 0, 2)]),
    proposals: [{ id: 1, days: days([counts(2, 0, 0, 0), counts(0, 0, 0, 0), counts(0, 1, 0, 0)]) }]
  };
}

function setView(name: "Daily" | "Cumulative") {
  fireEvent.click(within(screen.getByRole("group", { name: "Reveal view" })).getByRole("button", { name }));
}

function surface(rect = { left: 0, top: 0, width: 872, height: 252 }) {
  const slider = screen.getByRole("slider", { name: "Inspect revealed shares" });
  const svg = slider.closest("svg")!;
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height, toJSON: () => ({ ...rect }) });
  return slider;
}

function pointer(slider: HTMLElement, type: "pointermove" | "pointerdown" | "pointerout", clientX: number, clientY = 40, pointerType = "mouse") {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  fireEvent(slider, event);
}

function expectCounts(expected: CoinholderRevealCounts, total: number) {
  const tooltip = screen.getByRole("tooltip");
  const labels = { accept: "Accept", reject: "Reject", lower: "Reject · lower amount", abstain: "Abstain" };
  for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
    const row = within(tooltip).getByText(labels[key], { exact: true }).closest("div")!;
    expect(within(row).getByText(`${expected[key]} ${expected[key] === 1 ? "share" : "shares"}`, { exact: true })).toBeInTheDocument();
  }
  expect(tooltip.querySelector("strong")).toHaveTextContent(`${total} ${total === 1 ? "share" : "shares"} total`);
}

describe("Coinholder revealed-share chart", () => {
  it("defaults to cumulative option counts with steps at daily boundaries and distinct line patterns", () => {
    const view = render(<CoinholderRevealsChart history={historyFixture()} selectedBallot={null} />);
    expect(screen.getByRole("region", { name: "Revealed shares" })).toBeInTheDocument();
    expect(screen.getByText("Daily · UTC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cumulative" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: /Cumulative revealed shares by option; 12 shares/ })).toBeInTheDocument();
    expect(screen.getByText("Sep 20–Sep 22, 2026 · UTC")).toBeInTheDocument();
    const paths = [...view.container.querySelectorAll<SVGPathElement>("path.coin-reveal-line")];
    expect(paths).toHaveLength(4);
    expect(new Set(paths.map(path => path.getAttribute("stroke-dasharray") ?? "solid")).size).toBe(4);
    for (const path of paths) {
      // Keep the zero baseline until the first day's end, then step vertically.
      expect(path.getAttribute("d")).toMatch(/^M 46 206 H 313\.3333333333333 V /);
      expect(path.getAttribute("d")).not.toMatch(/[LCQS]/);
    }
    // Cumulative x-axis labels refer to the actual snapshot boundaries.
    expect(view.container.querySelector(".coin-axis-x:last-child")).toHaveTextContent("Sep 23");
    expect(view.container.querySelector(".coin-axis-x:last-child")).toHaveAttribute("data-axis-x", "848");
    expect(screen.getByRole("img").querySelectorAll("text")).toHaveLength(0);
  });

  it("shows exact daily options and cumulative totals in the data disclosure", () => {
    render(<CoinholderRevealsChart history={historyFixture()} selectedBallot={null} />);
    const table = screen.getByRole("table", { name: /Revealed shares by UTC day/, hidden: true });
    const rows = within(table).getAllByRole("row", { hidden: true }).slice(1).map(row => [...row.querySelectorAll("th,td")].map(cell => cell.textContent));
    expect(rows).toEqual([
      ["Sep 20, 2026", "3", "1", "1", "0", "5", "5"],
      ["Sep 21, 2026", "0", "0", "0", "0", "0", "5"],
      ["Sep 22, 2026", "1", "4", "0", "2", "7", "12"]
    ]);
  });

  it("switches to daily stacked shares and inspects zero-count days across the entire plot", () => {
    const view = render(<CoinholderRevealsChart history={historyFixture()} selectedBallot={null} />);
    setView("Daily");
    expect(screen.getByRole("button", { name: "Daily" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: /Daily revealed shares by option; 12 shares/ })).toBeInTheDocument();
    expect(view.container.querySelectorAll(".coin-reveal-bar")).toHaveLength(12);
    const slider = surface();
    pointer(slider, "pointermove", 46 + 802 / 6);
    expectCounts(counts(3, 1, 1, 0), 5);
    expect(screen.getByRole("tooltip")).toHaveTextContent("During this day");
    pointer(slider, "pointermove", 46 + 802 / 2);
    expectCounts(counts(0, 0, 0, 0), 0);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Sep 21, 2026 · UTC");
    pointer(slider, "pointerout", 0);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("uses selected proposal counts and clears stale inspection when the proposal changes", () => {
    const history = historyFixture();
    const view = render(<CoinholderRevealsChart history={history} selectedBallot={null} />);
    const slider = surface();
    pointer(slider, "pointermove", 46 + 802 * 5 / 6);
    expectCounts(counts(4, 5, 1, 2), 12);
    view.rerender(<CoinholderRevealsChart history={history} selectedBallot={1} />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Cumulative revealed shares by option; 3 shares/ })).toBeInTheDocument();
    pointer(surface(), "pointermove", 46 + 802 * 5 / 6);
    expectCounts(counts(2, 1, 0, 0), 3);
  });

  it("clears stale values on view or source changes", () => {
    const history = historyFixture();
    const view = render(<CoinholderRevealsChart history={history} selectedBallot={null} />);
    pointer(surface(), "pointermove", 46 + 802 * 5 / 6);
    expectCounts(counts(4, 5, 1, 2), 12);
    setView("Daily");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    pointer(surface(), "pointermove", 46 + 802 * 5 / 6);
    expectCounts(counts(1, 4, 0, 2), 7);
    view.rerender(<CoinholderRevealsChart history={{ ...history, sha256: "changed-source" }} selectedBallot={null} />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("maps responsive pointer coordinates and tooltip positions through centered SVG letterboxing", () => {
    render(<CoinholderRevealsChart history={historyFixture()} selectedBallot={null} />);
    const slider = surface({ left: 20, top: 30, width: 1000, height: 252 });
    pointer(slider, "pointermove", 20 + 64 + 300, 70);
    expectCounts(counts(3, 1, 1, 0), 5);
    // 64px horizontal letterboxing is included in the tooltip's placement.
    const percentages = [...screen.getByRole("tooltip").style.left.matchAll(/([\d.]+)%/g)].map(match => Number(match[1]));
    expect(percentages.some(value => Math.abs(value - 24.366666666666667) < .001)).toBe(true);
    vi.mocked(slider.closest("svg")!.getBoundingClientRect).mockReturnValue({ left: 20, top: 30, x: 20, y: 30, width: 436, height: 252, right: 456, bottom: 282, toJSON: () => ({}) });
    pointer(slider, "pointermove", 20 + (46 + 802 * 5 / 6) / 2, 180);
    expectCounts(counts(4, 5, 1, 2), 12);
  });

  it("supports keyboard inspection, bounds, focus retention, Escape and blur", () => {
    render(<CoinholderRevealsChart history={historyFixture()} selectedBallot={null} />);
    const slider = surface();
    act(() => slider.focus());
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    expectCounts(counts(4, 5, 1, 2), 12);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Through Sep 23, 00:00 UTC");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expectCounts(counts(3, 1, 1, 0), 5);
    expect(slider).toHaveAttribute("aria-valuenow", "2");
    fireEvent.keyDown(slider, { key: "Home" });
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    pointer(slider, "pointermove", 46 + 802 / 2);
    pointer(slider, "pointerout", 0);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(slider, { key: "End" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    expect(slider.getAttribute("aria-valuetext")).toContain("Accept: 4 shares");
    fireEvent.keyDown(slider, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => slider.blur()); act(() => slider.focus());
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    act(() => slider.blur());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("retains a touched day after the pointer leaves", () => {
    render(<CoinholderRevealsChart history={historyFixture()} selectedBallot={null} />);
    const slider = surface();
    pointer(slider, "pointerdown", 46 + 802 / 6, 40, "touch");
    pointer(slider, "pointerout", 0, 40, "touch");
    expectCounts(counts(3, 1, 1, 0), 5);
  });

  it.each([null, { ...historyFixture(), days: [] }])("does not fabricate zero history for an unavailable source", history => {
    render(<CoinholderRevealsChart history={history} selectedBallot={null} />);
    expect(screen.getByText("Share history unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByText("Total shares")).not.toBeInTheDocument();
  });

  it("shows unavailable for a missing proposal instead of substituting whole-round counts", () => {
    render(<CoinholderRevealsChart history={historyFixture()} selectedBallot={99} />);
    expect(screen.getByText("Share history unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { hidden: true })).not.toBeInTheDocument();
  });
});
