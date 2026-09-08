import { spreadsheetSource } from "@/lib/zcg/source-links";

export function SourceRecordLink({ gid, rowIndex, importedAt }: {
  gid: string | null;
  rowIndex: number | null;
  importedAt: Date;
}) {
  const { sourceRow, sourceUrl } = spreadsheetSource(gid, rowIndex);
  if (!sourceUrl) return <span className="text-stone-400">Source unavailable</span>;
  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="whitespace-nowrap text-xs text-amber-700 hover:underline"
      title={`Imported ${importedAt.toISOString()}. The live source row may have changed since collection.`}
    >
      {sourceRow != null ? `Sheet row ${sourceRow}` : "Source sheet"} ↗
    </a>
  );
}
