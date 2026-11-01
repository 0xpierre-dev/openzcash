import { fireEvent, render, screen, within } from "@testing-library/react";
import { CoinholderChartHelp } from "@/components/coinholder-chart-help";

const guides = [
  { chart: "casts", title: "Cast volume", phrases: ["encrypted cast messages", "UTC day, hour or minute", "Casts are not wallets or ZEC weight over time", "for minute detail, an hour", "Home/End and Escape"] },
  { chart: "reveals", title: "Revealed shares", phrases: ["Daily bars show new shares", "Cumulative lines step up at each UTC day’s end", "protocol portions with variable ZEC weights", "does not represent people or ZEC"] },
  { chart: "comparison", title: "Shares vs ZEC", phrases: ["Circles show share percentages", "diamonds show final ZEC percentages", "each divided by its own total across all four options", "Gap is ZEC % minus share %", "share counts do not identify holders"] },
  { chart: "margin", title: "Decision margin", phrases: ["Accept ZEC percentage minus 50, excluding Abstain", "strictly more than 50%", "quorum of at least 420,000 ZEC that includes Abstain", "Enter to select and Escape to clear"] },
  { chart: "heatmap", title: "Reveal heatmap", phrases: ["Rows are proposals and columns are UTC days", "daily shares across all four options, not the number of shares", "0% cell has shares in other options", "“No shares” means no reveals that day", "Sep 17 begins at round creation"] }
] as const;

describe("Coinholder chart help", () => {
  it.each(guides)("provides a collapsed, independently named explanation for $title", ({ chart, title, phrases }) => {
    render(<CoinholderChartHelp chart={chart} />);
    const button = screen.getByRole("button", { name: `How to read ${title}` });
    expect(button).toHaveTextContent("How to read");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: `${title} guide` })).not.toBeInTheDocument();
    const content = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(content).not.toBeVisible();
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: `${title} guide` })).toBe(content);
    expect(content).toBeVisible();
    phrases.forEach(phrase => expect(content).toHaveTextContent(phrase));
    expect(content.querySelectorAll("p")).toHaveLength(2);
    expect(within(content).queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(content).not.toBeVisible();
  });

  it("closes with Escape and returns focus to its native button", () => {
    render(<CoinholderChartHelp chart="comparison" />);
    const button = screen.getByRole("button", { name: "How to read Shares vs ZEC" });
    fireEvent.click(button);
    const region = screen.getByRole("region", { name: "Shares vs ZEC guide" });
    fireEvent.keyDown(region, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
    expect(region).not.toBeVisible();
  });

  it("gives all five disclosures unique controls without opening other charts", () => {
    render(<>{guides.map(guide => <CoinholderChartHelp key={guide.chart} chart={guide.chart} />)}</>);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
    expect(new Set(buttons.map(button => button.getAttribute("aria-controls"))).size).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: "How to read Revealed shares" }));
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Revealed shares guide" })).toBeVisible();
    expect(buttons.filter(button => button.getAttribute("aria-expanded") === "true")).toHaveLength(1);
  });
});
