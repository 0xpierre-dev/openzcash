import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { CoinholderDecisionChart } from "@/components/coinholder-decision-chart";
import { buildCoinholderDashboard, type CoinholderOptionId, type CoinholderProposal } from "@/lib/domain/coinholder";
import raw from "@/data/coinholder/q3-2026-summary.json";
import metadata from "@/data/coinholder/q3-2026-metadata.json";

const proposals = buildCoinholderDashboard(raw, metadata, {
  state: "verified", checkedAt: "2026-10-09T05:06:55Z", snapshotFetchedAt: "2026-10-09T05:06:55Z", sha256: "test", url: "https://zvote.zfnd.org", metadataUrl: "https://openzcash.org", warning: null
}).proposals;
const rows = () => within(screen.getByRole("list", { name: "Proposals ranked by decision margin" })).getAllByRole("button");
const selected = (ballot: number) => render(<CoinholderDecisionChart proposals={proposals} selectedBallot={ballot} onSelectBallot={vi.fn()} />);

function synthetic(ballot: number, weights: Record<CoinholderOptionId, bigint>): CoinholderProposal {
  return {
    ...proposals[0], ballot, title: `Synthetic proposal ${ballot}`, totalZec: "0", computedOutcome: "FUNDED", quorumMet: false, acceptSharePercent: 12,
    options: proposals[0].options.map(option => ({ ...option, weightUnits: String(weights[option.id]), zec: "0", sharePercent: 12 }))
  };
}

describe("Coinholder decision margin chart", () => {
  it("shows all 37 proposals ranked by exact margin with the closest proposal and all outcomes", () => {
    const before = proposals.map(proposal => proposal.ballot);
    render(<CoinholderDecisionChart proposals={proposals} selectedBallot={null} onSelectBallot={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Decision margin" })).toBeInTheDocument();
    expect(screen.getByText("Final ZEC · margin from 50%")).toBeInTheDocument();
    expect(screen.getByText("Highest margin first")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Decision margin ranking" })).toHaveAttribute("tabindex", "0");
    const buttons = rows();
    expect(buttons).toHaveLength(37);
    expect(buttons[0]).toHaveAttribute("data-margin-ballot", "33");
    expect(screen.getAllByText("Approved", { exact: true })).toHaveLength(17);
    expect(screen.getAllByText("Rejected", { exact: true })).toHaveLength(20);
    const ordered = buttons.map(button => Number(button.title.match(/margin ([+−\d.]+) pp/)![1].replace("−", "-")));
    expect(ordered).toEqual([...ordered].sort((a, b) => b - a));
    const closest = buttons.reduce((best, button) => {
      const distance = (item: HTMLElement) => Math.abs(Number(item.title.match(/margin ([+−\d.]+) pp/)![1].replace("−", "-")));
      return distance(button) < distance(best) ? button : best;
    });
    expect(closest).toHaveAttribute("data-margin-ballot", "14");
    expect(within(closest).getByText("66.39%", { exact: true })).toBeInTheDocument();
    expect(within(closest).getByText("+16.39 pp", { exact: true })).toBeInTheDocument();
    expect(proposals.map(proposal => proposal.ballot)).toEqual(before);
  });

  it("shows proposal 8's exact final weights and separates quorum from its rejected majority", () => {
    selected(8);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveAttribute("aria-pressed", "true");
    expect(within(rows()[0]).getByText("2.93%", { exact: true })).toBeInTheDocument();
    expect(within(rows()[0]).getByText("−47.07 pp", { exact: true })).toBeInTheDocument();
    expect(within(rows()[0]).getByText("Rejected", { exact: true })).toBeInTheDocument();
    const quorum = screen.getByRole("group", { name: "Selected proposal quorum" });
    expect(quorum).toHaveTextContent("Quorum met");
    expect(quorum).toHaveTextContent("2,179,209.875 ZEC / 420,000 ZEC minimum");
    expect(screen.getByText("Percentage points · Majority excludes abstentions.")).toBeVisible();
    fireEvent.click(screen.getByText("Exact weights", { exact: true }));
    for (const value of ["60,769.125 ZEC", "2,012,174.625 ZEC", "1,833.75 ZEC", "104,432.375 ZEC", "2,074,777.5 ZEC"]) {
      expect(within(quorum).getByText(value, { exact: true })).toBeInTheDocument();
    }
    expect(rows()[0]).toHaveAccessibleDescription(/Quorum met: 2,179,209.875 ZEC/);
  });

  it("uses exact raw ratios for ranking even when two margins display identically", () => {
    const base = 1_000_000_000_000_000_000n;
    const tiedDisplay = [
      synthetic(1, { accept: base + 1n, reject: base, lower: 0n, abstain: 0n }),
      synthetic(2, { accept: base + 2n, reject: base, lower: 0n, abstain: 0n })
    ];
    render(<CoinholderDecisionChart proposals={tiedDisplay} selectedBallot={null} onSelectBallot={vi.fn()} />);
    expect(rows().map(button => button.dataset.marginBallot)).toEqual(["2", "1"]);
    expect(screen.getAllByText("50.00%", { exact: true })).toHaveLength(2);
    expect(screen.getAllByText("Approved", { exact: true })).toHaveLength(2);
  });

  it("rejects exactly 50% with zero margin, including the lower-amount rejection in the denominator", () => {
    const proposal = synthetic(1, { accept: 1_680_000n, reject: 0n, lower: 1_680_000n, abstain: 0n });
    render(<CoinholderDecisionChart proposals={[proposal]} selectedBallot={1} onSelectBallot={vi.fn()} />);
    expect(within(rows()[0]).getByText("50.00%", { exact: true })).toBeInTheDocument();
    expect(within(rows()[0]).getByText("0.00 pp", { exact: true })).toBeInTheDocument();
    expect(within(rows()[0]).getByText("Rejected", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Selected proposal quorum" })).toHaveTextContent("Quorum met420,000 ZEC");
  });

  it("shows N/A for zero non-abstaining weight while preserving a met quorum", () => {
    const proposal = synthetic(1, { accept: 0n, reject: 0n, lower: 0n, abstain: 3_360_000n });
    const view = render(<CoinholderDecisionChart proposals={[proposal]} selectedBallot={1} onSelectBallot={vi.fn()} />);
    expect(within(rows()[0]).getAllByText("N/A", { exact: true })).toHaveLength(2);
    expect(within(rows()[0]).getByText("Rejected", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Selected proposal quorum" })).toHaveTextContent("Quorum met");
    expect(view.container.querySelector(".coin-margin-bar")).toBeNull();
  });

  it("keeps a positive majority rejected when quorum is unmet and formats large ZEC amounts exactly", () => {
    const proposal = synthetic(1, { accept: 800n, reject: 0n, lower: 0n, abstain: 0n });
    const view = render(<CoinholderDecisionChart proposals={[proposal]} selectedBallot={1} onSelectBallot={vi.fn()} />);
    expect(within(rows()[0]).getByText("100.00%", { exact: true })).toBeInTheDocument();
    expect(within(rows()[0]).getByText("+50.00 pp", { exact: true })).toBeInTheDocument();
    expect(within(rows()[0]).getByText("Rejected", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Selected proposal quorum" })).toHaveTextContent("Quorum not met100 ZEC");
    const large = synthetic(1, { accept: 9_007_199_254_740_993n, reject: 0n, lower: 0n, abstain: 0n });
    view.rerender(<CoinholderDecisionChart proposals={[large]} selectedBallot={1} onSelectBallot={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Selected proposal quorum" })).toHaveTextContent("1,125,899,906,842,624.125 ZEC");
  });

  it("supports keyboard row navigation and selection callbacks without changing selection on focus", () => {
    const onSelect = vi.fn();
    const view = render(<CoinholderDecisionChart proposals={proposals} selectedBallot={null} onSelectBallot={onSelect} />);
    const buttons = rows();
    act(() => buttons[0].focus());
    fireEvent.keyDown(buttons[0], { key: "ArrowDown" });
    expect(buttons[1]).toHaveFocus();
    fireEvent.keyDown(buttons[1], { key: "End" });
    expect(buttons[36]).toHaveFocus();
    fireEvent.keyDown(buttons[36], { key: "ArrowDown" });
    expect(buttons[36]).toHaveFocus();
    fireEvent.keyDown(buttons[36], { key: "Home" });
    fireEvent.keyDown(buttons[0], { key: "ArrowUp" });
    expect(buttons[0]).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenLastCalledWith(33);
    view.rerender(<CoinholderDecisionChart proposals={proposals} selectedBallot={33} onSelectBallot={onSelect} />);
    fireEvent.keyDown(rows()[0], { key: "Escape" });
    expect(onSelect).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "All proposals" }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("does not replace an unknown proposal selection with other proposals", () => {
    render(<CoinholderDecisionChart proposals={proposals} selectedBallot={999} onSelectBallot={vi.fn()} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("Decision data unavailable for this selection.")).toBeInTheDocument();
  });
});
