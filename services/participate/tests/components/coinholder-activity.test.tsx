import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { CoinholderActivityChart, fillCoinholderBuckets, groupCoinholderDays } from "@/components/coinholder-activity";
import raw from "@/data/coinholder/q3-2026-summary.json";
import metadata from "@/data/coinholder/q3-2026-metadata.json";
import { buildCoinholderDashboard, COINHOLDER_ROUND_ID, type CoinholderActivity } from "@/lib/domain/coinholder";

const HOUR = 3_600_000;
const START = Date.parse("2026-09-20T10:00:00Z");
const proposals = buildCoinholderDashboard(raw, metadata, {
  state: "snapshot", checkedAt: "2026-10-09T04:00:00Z", snapshotFetchedAt: "2026-10-09T03:59:00Z",
  sha256: "test-only", url: "https://zvote.zfnd.org", metadataUrl: "https://openzcash.org", warning: null
}).proposals;

/** Deliberately small synthetic activity, used only to exercise chart behavior. */
function activityFixture(): CoinholderActivity {
  return {
    schemaVersion: 1, roundId: COINHOLDER_ROUND_ID, chainId: "test-chain", fetchedAt: "2026-10-09T04:00:00Z",
    sourceUrls: [], unit: "Encrypted vote commitments", complete: true,
    coverage: { fromHeight: 1, toHeight: 10, firstAt: "2026-09-20T10:01:20Z", lastAt: "2026-09-20T12:05:40Z" },
    totals: { transactions: 3, castMessages: 12 },
    hours: [{ at: "2026-09-20T10:00:00Z", count: 5, cumulative: 5 }, { at: "2026-09-20T12:00:00Z", count: 7, cumulative: 12 }],
    minutes: [{ at: "2026-09-20T10:01:00Z", count: 5, cumulative: 5 }, { at: "2026-09-20T12:03:00Z", count: 4, cumulative: 9 }, { at: "2026-09-20T12:05:00Z", count: 3, cumulative: 12 }],
    proposals: [{ id: 1, transactions: 1, castMessages: 5, hours: [{ at: "2026-09-20T10:00:00Z", count: 5, cumulative: 5 }], minutes: [{ at: "2026-09-20T10:01:00Z", count: 5, cumulative: 5 }] }],
    recentTransactions: [], evidence: {}
  };
}

function tableRows() {
  const table = screen.getByRole("table", { name: /encrypted cast activity/i, hidden: true });
  return within(table).getAllByRole("row", { hidden: true }).slice(1).map(row => within(row).getAllByRole("cell", { hidden: true }).map(cell => cell.textContent));
}

function inspectionSurface(rect = { left: 0, top: 0, width: 872, height: 252 }) {
  fireEvent.click(within(screen.getByRole("group", { name: "Cast interval" })).getByRole("button", { name: "Hourly" }));
  const surface = within(screen.getByRole("region", { name: "Cast volume" })).getByRole("slider", { name: "Inspect cast activity" });
  const svg = surface.closest("svg")!;
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    ...rect, x: rect.left, y: rect.top,
    right: rect.left + rect.width, bottom: rect.top + rect.height,
    toJSON: () => ({ ...rect })
  });
  return surface;
}

/** jsdom has no native PointerEvent; retain the coordinates and pointer type. */
function inspectPointer(surface: HTMLElement, type: "pointermove" | "pointerdown" | "pointerout", clientX: number, clientY = 40, pointerType = "mouse") {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  fireEvent(surface, event);
}

function expectInspection(period: string, count: number, cumulative: number) {
  const tooltip = within(screen.getByRole("region", { name: "Cast volume" })).getByRole("tooltip");
  expect(tooltip).toHaveTextContent(period);
  expect(within(tooltip).getByText(`${count} casts`, { exact: true })).toBeInTheDocument();
  expect(within(tooltip).getByText(`${cumulative} cumulative`, { exact: true })).toBeInTheDocument();
}

describe("Coinholder activity chart", () => {
  it("hydrates server-rendered SVG titles without replacing the chart or reporting a mismatch", async () => {
    const element = <CoinholderActivityChart revealHistory={null} activity={activityFixture()} proposals={proposals} selectedBallot={null} onSelectBallot={vi.fn()} />;
    const container = document.createElement("div");
    // innerHTML exercises the browser's SVG parsing rather than mounting a client-only tree.
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    const serverChart = container.querySelector("svg");
    expect(container.querySelector("rect title")).toHaveTextContent("Sep 20, 00:00 UTC · 12 casts");
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => { root = hydrateRoot(container, element, { onRecoverableError }); });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.querySelector("svg")).toBe(serverChart);
      fireEvent.click(within(container).getByRole("button", { name: "Per minute" }));
      expect(within(container).getByRole("img", { name: /Casts per minute, 7 casts/ })).toBeInTheDocument();
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(async () => { root?.unmount(); });
      container.remove();
    }
  });

  it("fills only complete history gaps and preserves counts when normalizing UTC timestamps", () => {
    const buckets = [{ at: "2026-09-20T10:00:00.000Z", count: 5, cumulative: 5 }, { at: "2026-09-20T12:00:00Z", count: 7, cumulative: 12 }];
    expect(fillCoinholderBuckets(buckets, START, START + 2 * HOUR, HOUR).map(bucket => [bucket.count, bucket.cumulative])).toEqual([[5, 5], [0, 5], [7, 12]]);
    expect(fillCoinholderBuckets(buckets, START + HOUR, START + 2 * HOUR, HOUR).map(bucket => [bucket.count, bucket.cumulative])).toEqual([[0, 5], [7, 12]]);
    expect(fillCoinholderBuckets(buckets, Number.NaN, START, HOUR)).toEqual([]);
    expect(fillCoinholderBuckets(buckets, START, START + 10_001 * HOUR, HOUR)).toEqual([]);
  });

  it("groups unsorted hourly counts into chronological UTC days without changing its inputs", () => {
    const hours = [
      { at: "2026-09-21T23:00:00Z", count: 3, cumulative: 15 },
      { at: "2026-09-20T23:00:00.000Z", count: 5, cumulative: 5 },
      { at: "2026-09-21T00:00:00Z", count: 7, cumulative: 12 }
    ];
    const original = structuredClone(hours);
    expect(groupCoinholderDays(hours)).toEqual([
      { at: "2026-09-20T00:00:00.000Z", count: 5, cumulative: 5 },
      { at: "2026-09-21T00:00:00.000Z", count: 10, cumulative: 15 }
    ]);
    expect(hours).toEqual(original);
    expect(groupCoinholderDays([])).toEqual([]);
  });

  it("shows five distinct data panels with daily cast activity and its data table", () => {
    render(<CoinholderActivityChart revealHistory={null} activity={activityFixture()} proposals={proposals} selectedBallot={null} onSelectBallot={vi.fn()} />);
    expect(within(screen.getByRole("group", { name: "Cast interval" })).getByRole("button", { name: "Daily" })).toHaveAttribute("aria-pressed", "true");
    for (const name of ["Cast volume", "Revealed shares", "Shares vs ZEC", "Decision margin", "Reveal heatmap"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("region", { name: "Final vote balance" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Activity proposal" }).parentElement?.querySelector("span")).toBeNull();
    expect(screen.getByText("Recorded casts")).toBeInTheDocument();
    expect([...document.querySelectorAll(".coin-chart-stack > section")].map(section => section.getAttribute("aria-label"))).toEqual([
      "Cast volume", "Revealed shares", "Shares vs ZEC", "Decision margin", "Reveal heatmap"
    ]);
    expect(within(screen.getByRole("region", { name: "Cast volume" })).getByRole("img", { name: /Casts per day, 12 casts/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Casts" })).not.toBeInTheDocument();
    expect(tableRows().map(row => row.slice(1))).toEqual([["12", "12"]]);
    expect(screen.getAllByRole("table", { name: /encrypted cast activity/i, hidden: true })).toHaveLength(1);
  });

  it("changes cast intervals without resetting cumulative totals in the data table", () => {
    render(<CoinholderActivityChart revealHistory={null} activity={activityFixture()} proposals={proposals} selectedBallot={null} onSelectBallot={vi.fn()} />);
    fireEvent.click(within(screen.getByRole("group", { name: "Cast interval" })).getByRole("button", { name: "Hourly" }));
    expect(screen.getByRole("img", { name: /Casts per hour, 12 casts/ })).toBeInTheDocument();
    const hourlyLabels = screen.getByRole("region", { name: "Cast volume" }).querySelectorAll(".coin-axis-x");
    expect([...hourlyLabels].map(label => Number(label.getAttribute("data-axis-x")))).toEqual([0, 1, 2].map(index => 46 + (index + .5) * (802 / 3)));
    expect([...hourlyLabels].map(label => label.querySelector(".coin-axis-x-detail")?.textContent)).toEqual(["10:00", "11:00", "12:00"]);
    fireEvent.click(screen.getByText("Chart data"));
    expect(screen.getByRole("region", { name: "Scrollable chart data" })).toHaveAttribute("tabindex", "0");
    expect(tableRows().map(row => row.slice(1))).toEqual([["5", "5"], ["0", "5"], ["7", "12"]]);

    fireEvent.click(within(screen.getByRole("group", { name: "Cast interval" })).getByRole("button", { name: "Per minute" }));
    expect(screen.getByRole("combobox", { name: "Inspect hour (UTC)" })).toHaveValue("2026-09-20T12:00:00.000Z");
    expect(screen.getByRole("img", { name: /Casts per minute, 7 casts/ })).toBeInTheDocument();
    const minutes = tableRows();
    expect(minutes).toHaveLength(60);
    expect(minutes[0].slice(1)).toEqual(["0", "5"]);
    expect(minutes[3].slice(1)).toEqual(["4", "9"]);
    expect(minutes[5].slice(1)).toEqual(["3", "12"]);
    expect(minutes[59].slice(1)).toEqual(["0", "12"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Inspect hour (UTC)" }), { target: { value: "2026-09-20T11:00:00.000Z" } });
    expect(tableRows().every(row => row[1] === "0" && row[2] === "5")).toBe(true);
    expect(screen.getByRole("region", { name: "Shares vs ZEC" })).toBeInTheDocument();
  });

  it("selects a proposal and shows its counts separately from the entire round", () => {
    const onSelect = vi.fn();
    const view = render(<CoinholderActivityChart revealHistory={null} activity={activityFixture()} proposals={proposals} selectedBallot={null} onSelectBallot={onSelect} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Activity proposal" }), { target: { value: "1" } });
    expect(onSelect).toHaveBeenCalledWith(1);
    view.rerender(<CoinholderActivityChart revealHistory={null} activity={activityFixture()} proposals={proposals} selectedBallot={1} onSelectBallot={onSelect} />);
    expect(screen.getByRole("img", { name: /Casts per day, 5 casts/ })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("group", { name: "Cast interval" })).getByRole("button", { name: "Per minute" }));
    expect(screen.getByRole("combobox", { name: "Inspect hour (UTC)" })).toHaveValue("2026-09-20T10:00:00.000Z");
    fireEvent.change(screen.getByRole("combobox", { name: "Activity proposal" }), { target: { value: "all" } });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("inspects every plot interval with the pointer, including zero-height buckets", () => {
    render(<CoinholderActivityChart revealHistory={null} activity={activityFixture()} proposals={proposals} selectedBallot={null} onSelectBallot={vi.fn()} />);
    const surface = inspectionSurface();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // Above the first bar: inspection covers the plot, not just painted bars.
    inspectPointer(surface, "pointermove", 46 + 802 / 6);
    expectInspection("Sep 20, 10:00–11:00 UTC", 5, 5);
    inspectPointer(surface, "pointermove", 46 + 802 / 2);
    expectInspection("Sep 20, 11:00–12:00 UTC", 0, 5);
    inspectPointer(surface, "pointermove", 46 + 802 * 5 / 6);
    expectInspection("Sep 20, 12:00–13:00 UTC", 7, 12);

    inspectPointer(surface, "pointerout", 46 + 802 * 5 / 6);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("maps pointer coordinates through responsive SVG scaling and centered letterboxing", () => {
    render(<CoinholderActivityChart revealHistory={null} activity={activityFixture()} proposals={proposals} selectedBallot={null} onSelectBallot={vi.fn()} />);
    const surface = inspectionSurface({ left: 20, top: 30, width: 1000, height: 252 });

    // xMidYMid meet leaves 64px on either side. ViewBox x=300 is still hour one;
    // stretching the viewBox to the bounding rectangle would select hour two.
    inspectPointer(surface, "pointermove", 20 + 64 + 300, 30 + 40);
    expectInspection("Sep 20, 10:00–11:00 UTC", 5, 5);

    const svg = surface.closest("svg")!;
    vi.mocked(svg.getBoundingClientRect).mockReturnValue({
      left: 20, top: 30, x: 20, y: 30, width: 436, height: 252,
      right: 456, bottom: 282, toJSON: () => ({})
    });
    // Half scale with 63px vertical letterboxing; this is inside the plot.
    inspectPointer(surface, "pointermove", 20 + (46 + 802 / 2) / 2, 30 + 150);
    expectInspection("Sep 20, 11:00–12:00 UTC", 0, 5);
  });

  it("supports peak focus, keyboard traversal, bounds, Escape, and blur", () => {
    render(<CoinholderActivityChart revealHistory={null} activity={activityFixture()} proposals={proposals} selectedBallot={null} onSelectBallot={vi.fn()} />);
    const surface = inspectionSurface();
    act(() => surface.focus());
    expectInspection("Sep 20, 12:00–13:00 UTC", 7, 12);
    expect(surface).toHaveAttribute("aria-valuenow", "3");

    inspectPointer(surface, "pointerout", 0);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(surface, { key: "ArrowLeft" });
    expectInspection("Sep 20, 11:00–12:00 UTC", 0, 5);
    expect(surface).toHaveAttribute("aria-valuenow", "2");
    fireEvent.keyDown(surface, { key: "Home" });
    expectInspection("Sep 20, 10:00–11:00 UTC", 5, 5);
    fireEvent.keyDown(surface, { key: "ArrowLeft" });
    expect(surface).toHaveAttribute("aria-valuenow", "1");
    fireEvent.keyDown(surface, { key: "End" });
    fireEvent.keyDown(surface, { key: "ArrowRight" });
    expect(surface).toHaveAttribute("aria-valuenow", "3");
    fireEvent.keyDown(surface, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    act(() => surface.blur());
    act(() => surface.focus());
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    act(() => surface.blur());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keeps a touch-selected bucket visible after the pointer leaves", () => {
    render(<CoinholderActivityChart revealHistory={null} activity={activityFixture()} proposals={proposals} selectedBallot={null} onSelectBallot={vi.fn()} />);
    const surface = inspectionSurface();
    inspectPointer(surface, "pointerdown", 46 + 802 / 6, 40, "touch");
    expectInspection("Sep 20, 10:00–11:00 UTC", 5, 5);
    inspectPointer(surface, "pointerout", 46 + 802 / 6, 40, "touch");
    expectInspection("Sep 20, 10:00–11:00 UTC", 5, 5);
  });

  it("retains inspection after hovering a keyboard-focused chart until focus leaves", () => {
    render(<CoinholderActivityChart revealHistory={null} activity={activityFixture()} proposals={proposals} selectedBallot={null} onSelectBallot={vi.fn()} />);
    const surface = inspectionSurface();
    act(() => surface.focus());
    inspectPointer(surface, "pointermove", 46 + 802 / 2);
    expectInspection("Sep 20, 11:00–12:00 UTC", 0, 5);
    inspectPointer(surface, "pointerout", 46 + 802 / 2);
    expectInspection("Sep 20, 11:00–12:00 UTC", 0, 5);
    act(() => surface.blur());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("clears stale cast inspections when the interval, hour or proposal changes", () => {
    const activity = activityFixture();
    const onSelect = vi.fn();
    const view = render(<CoinholderActivityChart revealHistory={null} activity={activity} proposals={proposals} selectedBallot={null} onSelectBallot={onSelect} />);
    fireEvent.click(within(screen.getByRole("group", { name: "Cast interval" })).getByRole("button", { name: "Hourly" }));
    const inspectCast = () => {
      for (const name of ["Inspect cast activity"]) {
        const surface = screen.getByRole("slider", { name });
        const svg = surface.closest("svg")!;
        vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 872, height: 252, x: 0, y: 0, right: 872, bottom: 252, toJSON: () => ({}) });
        const count = Number(surface.getAttribute("aria-valuemax"));
        const index = Number(surface.getAttribute("aria-valuenow")) - 1;
        inspectPointer(surface, "pointerdown", 46 + (index + .5) * 802 / count, 40, "touch");
      }
      expect(within(screen.getByRole("region", { name: "Cast volume" })).getByRole("tooltip")).toBeInTheDocument();
    };
    inspectCast();
    expectInspection("Sep 20, 12:00–13:00 UTC", 7, 12);
    fireEvent.click(within(screen.getByRole("group", { name: "Cast interval" })).getByRole("button", { name: "Per minute" }));
    expect(screen.queryAllByRole("tooltip")).toHaveLength(0);

    inspectCast();
    expectInspection("Sep 20, 12:03–12:04 UTC", 4, 9);
    fireEvent.change(screen.getByRole("combobox", { name: "Inspect hour (UTC)" }), { target: { value: "2026-09-20T11:00:00.000Z" } });
    expect(screen.queryAllByRole("tooltip")).toHaveLength(0);

    inspectCast();
    expectInspection("Sep 20, 11:00–11:01 UTC", 0, 5);
    view.rerender(<CoinholderActivityChart revealHistory={null} activity={activity} proposals={proposals} selectedBallot={1} onSelectBallot={onSelect} />);
    expect(screen.queryAllByRole("tooltip")).toHaveLength(0);
    expect(screen.getByRole("combobox", { name: "Inspect hour (UTC)" })).toHaveValue("2026-09-20T10:00:00.000Z");
  });

  it("suppresses incomplete activity plots without hiding the independently available final results", () => {
    const partial = activityFixture();
    partial.complete = false;
    partial.coverage.reason = "A source block is unavailable.";
    const view = render(<CoinholderActivityChart revealHistory={null} activity={partial} proposals={proposals} selectedBallot={null} onSelectBallot={vi.fn()} />);
    for (const name of ["Cast volume"]) {
      const plot = within(screen.getByRole("region", { name }));
      expect(plot.getByText("Activity index incomplete")).toBeInTheDocument();
      expect(plot.getByText("A source block is unavailable.")).toBeInTheDocument();
      expect(plot.queryByRole("img")).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("table", { name: /encrypted cast activity/i, hidden: true })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Shares vs ZEC" })).toHaveTextContent("79,508");
    fireEvent.click(within(screen.getByRole("group", { name: "Cast interval" })).getByRole("button", { name: "Per minute" }));
    expect(screen.queryByRole("slider", { name: "Inspect cast activity" })).not.toBeInTheDocument();
    view.rerender(<CoinholderActivityChart revealHistory={null} activity={null} proposals={proposals} selectedBallot={null} onSelectBallot={vi.fn()} />);
    for (const name of ["Cast volume"]) {
      const plot = within(screen.getByRole("region", { name }));
      expect(plot.getByText("Activity index unavailable")).toBeInTheDocument();
      expect(plot.queryByRole("img")).not.toBeInTheDocument();
    }
    expect(screen.getByRole("region", { name: "Shares vs ZEC" })).toHaveTextContent("79,508");
  });
});
