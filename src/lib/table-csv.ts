/** Serialize every selected record, retaining displayed units and precision. */
export function tableCsv(headers: string[], rows: string[][]): string {
  const cell = (value: string) => {
    // Treat untrusted labels as text when the file is opened in a spreadsheet.
    const safe = /^\s*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")
  );
}
