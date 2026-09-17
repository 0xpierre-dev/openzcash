"use client";
import { useState } from "react";
import { tableCsv } from "@/lib/table-csv";

export function CopyPageLink() {
  const [message, setMessage] = useState("Copy link");
  return (
    <button
      className="ws-button"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setMessage("Link copied");
        } catch {
          setMessage("Copy the address above");
        }
      }}
    >
      {message}
      <span aria-hidden>↗</span>
    </button>
  );
}

/** Export the visible record fields without turning text into spreadsheet formulas. */
export function downloadTableCsv(
  headers: string[],
  rows: string[][],
  filename: string,
) {
  const csv = tableCsv(headers, rows);
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
