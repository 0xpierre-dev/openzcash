/** Render exact decimal strings without a lossy floating-point conversion. */
export function historyAmount(value: string | null, unit: "USD" | "ZEC" = "USD") {
  if (value === null || !/^-?\d+$/.test(value)) return "Not linked";
  const n = BigInt(value), absolute = n < 0n ? -n : n, places = unit === "USD" ? 2 : 8;
  const base = 10n ** BigInt(places), whole = (absolute / base).toLocaleString("en-US");
  const fractional = (absolute % base).toString().padStart(places, "0");
  const decimal = unit === "ZEC" ? fractional.replace(/0+$/, "") : fractional;
  return `${n < 0n ? "−" : ""}${unit === "USD" ? "$" : ""}${whole}${decimal ? `.${decimal}` : ""}${unit === "ZEC" ? " ZEC" : ""}`;
}
