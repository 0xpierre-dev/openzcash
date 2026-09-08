import { afterEach, describe, expect, it, vi } from "vitest";
import { formatUsdCents } from "./format";

afterEach(() => vi.restoreAllMocks());

describe("USD display across server and browser runtimes", () => {
  it("explicitly sets compact fraction digits instead of relying on ICU currency defaults", () => {
    const NativeNumberFormat = Intl.NumberFormat;
    const formatter = vi.spyOn(Intl, "NumberFormat").mockImplementation(function (locales, options) {
      return new NativeNumberFormat(locales, options);
    });
    expect(formatUsdCents(100_000_000n, { compact: true })).toBe("$1M");
    expect(formatter).toHaveBeenCalledWith("en-US", expect.objectContaining({
      notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1,
    }));
  });

  it.each([
    [55_100_000n, "$551K"],
    [79_260_000n, "$792.6K"],
    [-10_000_000n, "-$100K"],
    [99_999n, "$999.99"],
    [0n, "$0"],
    [null, "·"],
  ])("formats %s cents as %s", (cents, expected) => {
    expect(formatUsdCents(cents, { compact: true })).toBe(expected);
  });
});
