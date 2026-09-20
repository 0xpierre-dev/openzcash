/** Plain numbers, optionally signed, with thousands separators, a currency
 * sign or a short unit ("-12.5", "-$1,000.00", "4,859.7741499 ZEC", "12%").
 * These are data, not formulas, and must survive a spreadsheet import intact. */
const NUMERIC = /^\s*[-−]?\$?\d[\d,]*(\.\d+)?(\s*[A-Za-z%]{1,4})?\s*$/;

/** Serialize every selected record, retaining displayed units and precision. */
export function tableCsv(headers: string[], rows: string[][]): string {
  const cell = (value: string) => {
    // Treat untrusted labels as text when the file is opened in a spreadsheet,
    // but never a negative amount such as a clawback.
    const safe =
      !NUMERIC.test(value) && /^\s*[=+@\-\t\r]/.test(value)
        ? `'${value}`
        : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return (
    "﻿" + [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")
  );
}
