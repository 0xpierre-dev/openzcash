import { ZCG_SHEET_ID } from "./sheets";

/** Imported row indexes are zero-based; Google Sheets displays one-based rows. */
export function spreadsheetSource(gid: string | null, rowIndex: number | null) {
  const sourceRow = rowIndex != null && Number.isSafeInteger(rowIndex + 1) && rowIndex >= 0
    ? rowIndex + 1
    : null;
  if (gid == null || !/^\d+$/.test(gid)) return { sourceRow: null, sourceUrl: null };
  const tabUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(ZCG_SHEET_ID)}/edit#gid=${gid}`;
  return {
    sourceRow,
    sourceUrl: sourceRow == null ? tabUrl : `${tabUrl}&range=A${sourceRow}`,
  };
}
