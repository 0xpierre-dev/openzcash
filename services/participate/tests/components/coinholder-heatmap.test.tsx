import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { CoinholderHeatmap } from "@/components/coinholder-heatmap";
import raw from "@/data/coinholder/q3-2026-summary.json";
import metadata from "@/data/coinholder/q3-2026-metadata.json";
import revealArchive from "@/data/coinholder/q3-2026-reveals.json";
import { buildCoinholderDashboard } from "@/lib/domain/coinholder";
import { parseCoinholderRevealHistory } from "@/lib/domain/coinholder-reveals";
import type { CoinholderRevealHistory } from "@/lib/domain/coinholder-reveals";

const history = parseCoinholderRevealHistory(revealArchive, raw);
const proposals = buildCoinholderDashboard(raw, metadata, {
  state: "verified", checkedAt: "2026-10-09T04:00:00.000Z", snapshotFetchedAt: "2026-10-09T03:59:00.000Z",
  sha256: "test-source-hash", url: "https://zvote.zfnd.org", metadataUrl: "https://openzcash.org", warning: null
}, null, history).proposals;

function setup(overrides: Partial<Parameters<typeof CoinholderHeatmap>[0]> = {}) {
  const props = { proposals, history, selectedBallot: null, onSelectBallot: vi.fn(), ...overrides };
  return { ...render(<CoinholderHeatmap {...props} />), props };
}
function rows() { return screen.getByRole("table").querySelectorAll("tbody tr"); }
function cell(rowIndex: number, dayIndex: number) { return rows()[rowIndex].querySelectorAll<HTMLButtonElement>("td button")[dayIndex]; }
function choose(name: string) { fireEvent.click(within(screen.getByRole("group", { name: "Heatmap option" })).getByRole("button", { name })); }
function details() { return screen.getByRole("status", { name: "Reveal cell details" }); }

describe("Coinholder reveal heatmap", () => {
  it("renders all 37 proposals and all 13 UTC days with percentages normalized within each proposal and day", () => {
    setup();
    expect(screen.getByRole("region", { name: "Reveal heatmap" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reveal heatmap" })).toBeInTheDocument();
    expect(screen.getByText("05", { exact: true })).toBeInTheDocument();
    expect(rows()).toHaveLength(37);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(14);
    expect(within(table).getByRole("columnheader", { name: "Sep 17" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Sep 29" })).toBeInTheDocument();
    expect(table.querySelectorAll("td button")).toHaveLength(481);
    expect(screen.getByRole("button", { name: "Accept" })).toHaveAttribute("aria-pressed", "true");

    for (const [option, label] of [["accept", "Accept"], ["reject", "Reject"], ["lower", "Lower amount"], ["abstain", "Abstain"]] as const) {
      choose(label);
      const renderedRows = table.querySelectorAll("tbody tr");
      for (let rowIndex = 0; rowIndex < 37; rowIndex++) {
        const proposal = history.proposals.find(value => value.id === rowIndex + 1)!;
        const buttons = renderedRows[rowIndex].querySelectorAll<HTMLButtonElement>("td button");
        for (let dayIndex = 0; dayIndex < 13; dayIndex++) {
          const day = proposal.days[dayIndex];
          const total = Object.values(day.counts).reduce((sum, count) => sum + count, 0);
          const button = buttons[dayIndex];
          if (!total) {
            expect(button).toHaveTextContent("—");
            expect(button).toHaveAccessibleName(/No shares; daily total 0/);
          } else {
            expect(button.textContent).toBe(`${Math.round(day.counts[option] * 1000 / total) / 10}%`);
            expect(button).toHaveAccessibleName(new RegExp(`${label}: ${day.counts[option].toLocaleString("en-US")} of ${total.toLocaleString("en-US")} revealed shares`));
          }
        }
      }
    }
    expect(screen.getByRole("region", { name: "Scrollable reveal heatmap" })).toHaveAttribute("tabindex", "0");
  });

  it("supports all four options and keeps the real proposal 3 lower-amount zeros distinct from no arrivals", () => {
    setup({ selectedBallot: 3 });
    for (const label of ["Reject", "Abstain", "Accept", "Lower amount"]) {
      choose(label);
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    }
    const source = history.proposals.find(proposal => proposal.id === 3)!;
    expect(source.days.every(day => day.counts.lower === 0)).toBe(true);
    const index = source.days.findIndex(day => day.total > 0);
    const button = cell(0, index);
    expect(button.textContent).toBe("0%");
    expect(button).not.toHaveClass("is-empty");
    expect(button).toHaveAccessibleName(/Lower amount: 0 of [\d,]+ revealed shares, 0.00%/);
    fireEvent.click(button);
    expect(details()).toHaveTextContent(`0 / ${source.days[index].total.toLocaleString("en-US")} shares`);
    expect(details()).toHaveTextContent("0.00%");
  });

  it("shows exact counts and UTC dates on hover, focus and tap and updates the inspected option", () => {
    setup({ selectedBallot: 1 });
    const source = history.proposals.find(proposal => proposal.id === 1)!;
    const assertReadout = (index: number, option: "accept" | "reject" = "accept") => {
      const day = source.days[index];
      expect(details()).toHaveTextContent(`#1 ${proposals.find(proposal => proposal.ballot === 1)!.title}`);
      expect(details()).toHaveTextContent(`Sep ${17 + index}, 2026 · UTC`);
      expect(details()).toHaveTextContent(`${day.counts[option].toLocaleString("en-US")} / ${day.total.toLocaleString("en-US")} shares`);
      expect(details()).toHaveTextContent(`${(100 * day.counts[option] / day.total).toFixed(2)}%`);
    };
    fireEvent.mouseEnter(cell(0, 1));
    assertReadout(1);
    act(() => cell(0, 2).focus());
    assertReadout(2);
    fireEvent.click(cell(0, 3));
    assertReadout(3);
    choose("Reject");
    assertReadout(3, "reject");
  });

  it("navigates cells with arrow keys and boundary keys without hundreds of tab stops", () => {
    setup();
    expect(screen.getByRole("table").querySelectorAll('td button[tabindex="0"]')).toHaveLength(1);
    act(() => cell(0, 0).focus());
    fireEvent.keyDown(cell(0, 0), { key: "ArrowRight" });
    expect(cell(0, 1)).toHaveFocus();
    fireEvent.keyDown(cell(0, 1), { key: "ArrowDown" });
    expect(cell(1, 1)).toHaveFocus();
    fireEvent.keyDown(cell(1, 1), { key: "End" });
    expect(cell(1, 12)).toHaveFocus();
    fireEvent.keyDown(cell(1, 12), { key: "ArrowRight" });
    expect(cell(1, 12)).toHaveFocus();
    fireEvent.keyDown(cell(1, 12), { key: "End", ctrlKey: true });
    expect(cell(36, 12)).toHaveFocus();
    fireEvent.keyDown(cell(36, 12), { key: "Home", ctrlKey: true });
    expect(cell(0, 0)).toHaveFocus();
    expect(screen.getByRole("table").querySelectorAll('td button[tabindex="0"]')).toHaveLength(1);
  });

  it("requests the global proposal filter and reflects its controlled value without retaining stale details", () => {
    const view = setup();
    fireEvent.click(cell(0, 2));
    const proposalButton = rows()[2].querySelector<HTMLButtonElement>("th button")!;
    fireEvent.click(proposalButton);
    expect(view.props.onSelectBallot).toHaveBeenCalledWith(3);
    expect(rows()).toHaveLength(37);
    view.rerender(<CoinholderHeatmap {...view.props} selectedBallot={3} />);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].querySelector("th")).toHaveTextContent(`#3${proposals.find(proposal => proposal.ballot === 3)!.title}`);
    expect(details()).toHaveTextContent("Hover, focus or tap a cell for exact counts.");
    fireEvent.click(screen.getByRole("button", { name: "All proposals" }));
    expect(view.props.onSelectBallot).toHaveBeenLastCalledWith(null);
    view.rerender(<CoinholderHeatmap {...view.props} selectedBallot={999} />);
    expect(screen.getByText("Proposal unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("marks a synthetic zero-total day as No shares without displaying a false zero percentage", () => {
    // Test-only zero day; the archive remains untouched.
    const noArrivals: CoinholderRevealHistory = structuredClone(history);
    const day = noArrivals.proposals.find(proposal => proposal.id === 3)!.days[0];
    day.counts = { accept: 0, reject: 0, lower: 0, abstain: 0 };
    day.total = 0;
    setup({ history: noArrivals, selectedBallot: 3 });
    const button = cell(0, 0);
    expect(button).toHaveClass("is-empty");
    expect(button.textContent).toBe("—");
    expect(button).toHaveAccessibleName(/No shares; daily total 0/);
    fireEvent.click(button);
    expect(details()).toHaveTextContent("No shares revealed on this day");
    expect(details()).not.toHaveTextContent("0%");
    choose("Lower amount");
    expect(button.textContent).toBe("—");
  });

  it("shows an unavailable state for missing history rather than a fabricated matrix", () => {
    setup({ history: null });
    expect(screen.getByRole("heading", { name: "Reveal heatmap" })).toBeInTheDocument();
    expect(screen.getByText("Reveal history unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("does not treat an absent proposal record as a zero-count day and clears a changed source inspection", () => {
    const incomplete: CoinholderRevealHistory = { ...history, proposals: history.proposals.filter(proposal => proposal.id !== 3) };
    const view = setup({ history: incomplete, selectedBallot: 3 });
    expect(cell(0, 0)).toHaveAccessibleName(/Unavailable$/);
    expect(cell(0, 0)).not.toHaveClass("is-empty");
    fireEvent.click(cell(0, 0));
    expect(details()).toHaveTextContent("Daily counts unavailable");
    view.rerender(<CoinholderHeatmap {...view.props} history={{ ...history, sha256: "test-new-source" }} />);
    expect(details()).toHaveTextContent("Hover, focus or tap a cell for exact counts.");
  });
});
