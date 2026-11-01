import { fireEvent, render, screen, within } from "@testing-library/react";
import { CoinholderShareWeightChart } from "@/components/coinholder-share-weight-chart";
import summary from "@/data/coinholder/q3-2026-summary.json";
import metadata from "@/data/coinholder/q3-2026-metadata.json";
import archive from "@/data/coinholder/q3-2026-reveals.json";
import { buildCoinholderDashboard, type CoinholderProposal } from "@/lib/domain/coinholder";
import { parseCoinholderRevealHistory, type CoinholderRevealHistory } from "@/lib/domain/coinholder-reveals";

const proposals = buildCoinholderDashboard(summary, metadata, {
  state: "snapshot", checkedAt: "2026-10-09T04:00:00Z", snapshotFetchedAt: "2026-10-09T03:59:00Z",
  sha256: "test-only", url: "https://zvote.zfnd.org", metadataUrl: "https://openzcash.org", warning: null
}).proposals;
const history = parseCoinholderRevealHistory(archive, summary);
const baseProps = { proposals, history, selectedBallot: null, onSelectBallot: vi.fn() };
function proposalRow(ballot: number) {
  return screen.getByRole("button", { name: new RegExp(`^#${ballot} `) }).closest("tr")!;
}
function optionRow(label: string) {
  return screen.getByRole("rowheader", { name: label }).closest("tr")!;
}
function expectValues(row: HTMLElement, values: string[]) {
  values.forEach(value => expect(within(row).getByText(value, { exact: true })).toBeInTheDocument());
}

describe("Coinholder shares versus ZEC composition", () => {
  it("shows all 37 proposals with Accept selected and exact #8 counts and final weight", () => {
    render(<CoinholderShareWeightChart {...baseProps} />);
    expect(screen.getByRole("region", { name: "Shares vs ZEC" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shares vs ZEC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toHaveAttribute("aria-pressed", "true");
    const table = screen.getByRole("table", { name: /^Accept across all 37 proposals/ });
    expect(within(table).getAllByRole("row")).toHaveLength(38);
    expect(proposalRow(37)).toBeInTheDocument();
    expectValues(proposalRow(8), ["1,494 shares", "38.28%", "60,769.125 ZEC", "2.79%", "-35.49 pp"]);
    expect(screen.getByText("Each percentage includes all four options. Gap = ZEC % − share %.")).toBeInTheDocument();
    // The governance majority excludes abstention; composition deliberately includes it.
    expect(proposals.find(proposal => proposal.ballot === 8)!.acceptSharePercent.toFixed(2)).not.toBe("2.79");
  });

  it("switches the option across every proposal without rounding exact ZEC amounts", () => {
    render(<CoinholderShareWeightChart {...baseProps} />);
    const group = screen.getByRole("group", { name: "Comparison option" });
    fireEvent.click(within(group).getByRole("button", { name: "Reject" }));
    expect(within(group).getByRole("button", { name: "Reject" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Accept" })).toHaveAttribute("aria-pressed", "false");
    expectValues(proposalRow(8), ["1,826 shares", "46.78%", "2,012,174.625 ZEC", "92.34%", "+45.55 pp"]);
    fireEvent.click(within(group).getByRole("button", { name: "Lower amount" }));
    expectValues(proposalRow(8), ["194 shares", "4.97%", "1,833.75 ZEC", "0.08%", "-4.89 pp"]);
    fireEvent.click(within(group).getByRole("button", { name: "Abstain" }));
    expectValues(proposalRow(8), ["389 shares", "9.97%", "104,432.375 ZEC", "4.79%", "-5.17 pp"]);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(38);
  });

  it("reconciles all 148 displayed counts and weights against the official summary", () => {
    render(<CoinholderShareWeightChart {...baseProps} />);
    const group = screen.getByRole("group", { name: "Comparison option" });
    const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
    ["Accept", "Reject", "Lower amount", "Abstain"].forEach((label, optionIndex) => {
      fireEvent.click(within(group).getByRole("button", { name: label }));
      const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
      expect(rows).toHaveLength(summary.proposals.length);
      summary.proposals.forEach((proposal, proposalIndex) => {
        const options = proposal.options as Array<{ index?: number; ballot_count?: number; total_value?: number }>;
        const option = options.find(candidate => (candidate.index ?? 0) === optionIndex)!;
        const count = option.ballot_count ?? 0;
        const units = option.total_value ?? 0;
        const counts = options.reduce((total, candidate) => total + (candidate.ballot_count ?? 0), 0);
        const weights = options.reduce((total, candidate) => total + (candidate.total_value ?? 0), 0);
        const cells = within(rows[proposalIndex]).getAllByRole("cell");
        expect(cells[1].querySelector("strong")).toHaveTextContent(`${numberFormat.format(count)} ${count === 1 ? "share" : "shares"}`);
        expect(cells[1].querySelector("small")).toHaveTextContent(`${(count / counts * 100).toFixed(2)}%`);
        // The official unit is 0.125 ZEC; preserve its three decimal places exactly.
        expect(cells[2].querySelector("strong")).toHaveTextContent(`${numberFormat.format(units / 8)} ZEC`);
        expect(cells[2].querySelector("small")).toHaveTextContent(`${(units / weights * 100).toFixed(2)}%`);
      });
    });
  });

  it("selects the ballot through a native button and presents all four option rows", () => {
    const onSelectBallot = vi.fn();
    const view = render(<CoinholderShareWeightChart {...baseProps} onSelectBallot={onSelectBallot} />);
    const button = screen.getByRole("button", { name: /^#8 / });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    // #8 is grant ID 59; global selection must receive the ballot number, not grant ID.
    expect(onSelectBallot).toHaveBeenCalledWith(8);
    view.rerender(<CoinholderShareWeightChart {...baseProps} selectedBallot={8} onSelectBallot={onSelectBallot} />);
    expect(screen.queryByRole("group", { name: "Comparison option" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: /^All options for proposal 8/ })).getAllByRole("row")).toHaveLength(5);
    expectValues(optionRow("Accept"), ["1,494 shares", "38.28%", "60,769.125 ZEC", "2.79%", "-35.49 pp"]);
    expectValues(optionRow("Reject"), ["1,826 shares", "46.78%", "2,012,174.625 ZEC", "92.34%", "+45.55 pp"]);
    expectValues(optionRow("Lower amount"), ["194 shares", "4.97%", "1,833.75 ZEC", "0.08%", "-4.89 pp"]);
    expectValues(optionRow("Abstain"), ["389 shares", "9.97%", "104,432.375 ZEC", "4.79%", "-5.17 pp"]);
    fireEvent.click(screen.getByRole("button", { name: "All proposals" }));
    expect(onSelectBallot).toHaveBeenLastCalledWith(null);
  });

  it("calculates gaps from raw ratios instead of subtracting rounded percentages", () => {
    render(<CoinholderShareWeightChart {...baseProps} />);
    expect(within(proposalRow(1)).getByText("-29.51 pp")).toBeInTheDocument();
    expect(within(proposalRow(1)).queryByText("-29.52 pp")).not.toBeInTheDocument();
  });

  it.each(["missing history", "missing proposal", "empty proposal history"])("preserves final ZEC while showing unavailable share values for %s", scenario => {
    let partial: CoinholderRevealHistory | null = null;
    if (scenario === "missing proposal") partial = { ...history, proposals: history.proposals.filter(proposal => proposal.id !== 8) };
    if (scenario === "empty proposal history") partial = { ...history, proposals: history.proposals.map(proposal => proposal.id === 8 ? { ...proposal, days: [] } : proposal) };
    render(<CoinholderShareWeightChart {...baseProps} history={partial} selectedBallot={8} />);
    const row = optionRow("Accept");
    expectValues(row, ["60,769.125 ZEC", "2.79%"]);
    expect(within(row).getAllByText("Unavailable", { exact: true })).toHaveLength(2);
    expect(within(row).queryByText(/shares$/)).not.toBeInTheDocument();
    expect(within(row).queryByText("0.00%")).not.toBeInTheDocument();
    expect(row.querySelector(".coin-share-weight-share")).not.toBeInTheDocument();
    expect(row.querySelector(".coin-share-weight-zec")).toBeInTheDocument();
  });

  it("keeps measured zeros while declining percentages with zero denominators", () => {
    const zeroCounts = { accept: 0, reject: 0, lower: 0, abstain: 0 };
    const zeroDay = { ...history.days[0], counts: zeroCounts, cumulative: zeroCounts, total: 0, cumulativeTotal: 0 };
    const zeroHistory: CoinholderRevealHistory = { ...history, proposals: [{ id: 8, days: [zeroDay] }] };
    const zeroProposal: CoinholderProposal = { ...proposals[7], options: proposals[7].options.map(option => ({ ...option, weightUnits: "0", zec: "0" })) };
    render(<CoinholderShareWeightChart {...baseProps} proposals={[zeroProposal]} history={zeroHistory} selectedBallot={8} />);
    const row = optionRow("Accept");
    expectValues(row, ["0 shares", "0 ZEC"]);
    expect(within(row).getAllByText("Unavailable", { exact: true })).toHaveLength(3);
    expect(within(row).queryByText("0.00%")).not.toBeInTheDocument();
  });

  it("preserves proposal verification, application and correction sources", () => {
    const corrected = proposals.find(proposal => proposal.correction?.url)!;
    render(<CoinholderShareWeightChart {...baseProps} selectedBallot={corrected.ballot} />);
    const disclosure = screen.getByText("Proposal details").closest("details")!;
    disclosure.open = true;
    expect(disclosure).toHaveTextContent(corrected.correction!.text);
    expect(within(disclosure).getByRole("link", { name: "Verify totals" })).toHaveAttribute("href", corrected.verifyUrl);
    expect(within(disclosure).getByRole("link", { name: "Grant application" })).toHaveAttribute("href", corrected.githubUrl);
    expect(within(disclosure).getByRole("link", { name: "FPF correction" })).toHaveAttribute("href", corrected.correction!.url);
    for (const link of within(disclosure).getAllByRole("link")) expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not replace an unknown selected ballot with all proposals", () => {
    render(<CoinholderShareWeightChart {...baseProps} selectedBallot={99} />);
    expect(screen.getByText("Proposal unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
