import { act, render } from "@testing-library/react";
import { CoinholderChartAxes, coinholderAxisIndices, coinholderAxisIntervals, coinholderCountScale, useCoinholderChartGeometry } from "@/components/coinholder-chart-axis";

function Harness() {
  const { svg, container, geometry } = useCoinholderChartGeometry();
  const { ticks, max } = coinholderCountScale(4967, coinholderAxisIntervals(geometry));
  return <div ref={container} data-testid="wrapper"><svg ref={svg} viewBox="0 0 872 252" /><CoinholderChartAxes geometry={geometry} ticks={ticks} max={max} labels={[{ x: 447, label: "Sep 20" }]} /></div>;
}

function box(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) };
}

describe("Coinholder chart axes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses exact integer steps and readable limits for counts", () => {
    expect(coinholderCountScale(4967)).toEqual({ max: 5000, ticks: [0, 1000, 2000, 3000, 4000, 5000] });
    expect(coinholderCountScale(4967, 2)).toEqual({ max: 5000, ticks: [0, 2500, 5000] });
    expect(coinholderCountScale(76874)).toEqual({ max: 80000, ticks: [0, 20000, 40000, 60000, 80000] });
    expect(coinholderCountScale(7)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
    expect(coinholderCountScale(0)).toEqual({ max: 1, ticks: [0, 1] });
    for (let value = 0; value < 100; value++) expect(coinholderCountScale(value).ticks.every(Number.isInteger)).toBe(true);
  });

  it("keeps sparse and mobile dates unique and tied to actual bucket indices", () => {
    expect(coinholderAxisIndices(1)).toEqual([0]);
    expect(coinholderAxisIndices(3)).toEqual([0, 1, 2]);
    expect(coinholderAxisIndices(13)).toEqual([0, 3, 6, 9, 12]);
    expect(coinholderAxisIndices(13, 240)).toEqual([0, 4, 8, 12]);
    expect(coinholderAxisIndices(0)).toEqual([]);
  });

  it("positions HTML labels through mobile padding and vertical letterboxing, then remeasures on resize", () => {
    let onResize: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { onResize = callback; } observe() {} disconnect = disconnect; });
    const view = render(<Harness />);
    const wrapper = view.getByTestId("wrapper");
    const svg = wrapper.querySelector("svg")!;
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue(box(10, 20, 340, 150));
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(box(50, 20, 300, 150));
    act(() => onResize!());
    const scale = 300 / 872;
    const label = wrapper.querySelector<HTMLElement>(".coin-axis-x")!;
    expect(parseFloat(label.style.left)).toBeCloseTo(40 + 447 * scale);
    expect(parseFloat(label.style.top)).toBeCloseTo((150 - 252 * scale) / 2 + 206 * scale + 12);
    expect([...wrapper.querySelectorAll(".coin-axis-y")].map(node => node.textContent)).toEqual(["0", "2,500", "5,000"]);
    const zero = wrapper.querySelector<HTMLElement>(".coin-axis-y")!;
    expect(parseFloat(zero.style.left)).toBeCloseTo(40 + 46 * scale - 8);
    expect(svg.querySelector("text")).toBeNull();

    vi.mocked(wrapper.getBoundingClientRect).mockReturnValue(box(10, 20, 1000, 252));
    vi.mocked(svg.getBoundingClientRect).mockReturnValue(box(10, 20, 1000, 252));
    act(() => onResize!());
    expect(parseFloat(label.style.left)).toBe(64 + 447);
    expect(parseFloat(label.style.top)).toBe(218);
    expect([...wrapper.querySelectorAll(".coin-axis-y")].map(node => node.textContent)).toEqual(["0", "1,000", "2,000", "3,000", "4,000", "5,000"]);
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
