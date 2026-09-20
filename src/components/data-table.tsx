"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { downloadTableCsv } from "./record-actions";

/**
 * Tabela filtrável estilo Excel — client component reutilizável.
 *
 * - SORT: clique no cabeçalho ordena asc/desc (ícone ▲▼). Usa `sortValue` se
 *   fornecido, senão deriva texto do valor cru/render.
 * - FILTER: ícone de funil por coluna abre um input; filtro = substring
 *   case-insensitive sobre `filterValue` (ou render como texto). Combina com
 *   AND entre colunas. Search global opcional no topo.
 * - Contagem "X of Y rows" quando filtrado.
 *
 * Valores devem ser serializáveis (string/number/ReactNode via render).
 * NÃO usa bigint internamente — as páginas server passam valores já prontos.
 *
 * @example
 * type Row = { grant: string; usd: number; status: ReactNode };
 *
 * const columns: Column<Row>[] = [
 *   { key: "grant", header: "Grant", sortable: true, filterable: true },
 *   {
 *     key: "usd",
 *     header: "Valor",
 *     align: "right",
 *     sortable: true,
 *     sortValue: (r) => r.usd,
 *     render: (r) => `$${r.usd.toLocaleString()}`,
 *   },
 *   { key: "status", header: "Status", render: (r) => r.status },
 * ];
 *
 * const rows: Row[] = [
 *   { grant: "Zcash Brazil", usd: 12000, status: <span>open</span> },
 *   { grant: "ZecHub", usd: 8000, status: <span>completed</span> },
 * ];
 *
 * <DataTable columns={columns} rows={rows} initialSort={{ key: "usd", dir: "desc" }} />
 */

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  /** Supplementary field: hidden below the `sm` breakpoint, where the table
   *  keeps only its primary columns. */
  mobileHidden?: boolean;
  /** `false` keeps the column out of the CSV export (e.g. admin controls). */
  csv?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  render?: (row: T) => ReactNode;
  /** Valor para ordenação. Se ausente, deriva texto da célula. */
  sortValue?: (row: T) => string | number;
  /** Texto-alvo do filtro. Se ausente, deriva texto da célula. */
  filterValue?: (row: T) => string;
  /**
   * "text" (default) = input de busca por substring.
   * "select" = checklist dos valores existentes na coluna (marca/desmarca),
   * para colunas com conjunto fixo (Status, Verdict, Categoria, Tipo…).
   */
  filterType?: "text" | "select";
}

type SortDir = "asc" | "desc";

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  initialPicks?: Record<string, string[]>;
  initialQuery?: string;
  initialSort?: { key: string; dir: SortDir };
  /** Habilita a barra de busca global no topo. Default: true. */
  globalSearch?: boolean;
  /** Classe extra do container com scroll. */
  className?: string;
  /** Altura máxima do container (qualquer valor Tailwind max-h-*). */
  maxHeight?: string;
  /**
   * Chave estável por linha (ex.: id). Sem ela, as linhas usam o índice como
   * key — o que desalinha o estado de células interativas após sort/filtro.
   */
  rowKey?: (row: T) => string | number;
  /** Quick status/verdict tabs derived from a "select" column. Pages that
   *  already filter by status server-side pass `false`. Default: true. */
  statusTabs?: boolean;
  /** Rows per page; the reader can switch to 50, 100 or all. Default: 25. */
  pageSize?: number;
  /** File name of the CSV export. */
  csvName?: string;
}

const PAGE_SIZES = [25, 50, 100];

const ALIGN_CLASS: Record<NonNullable<Column<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/** Texto bruto de uma célula para sort/filter quando não há acessor explícito. */
function cellText<T>(col: Column<T>, row: T): string {
  if (col.filterValue) return col.filterValue(row);
  if (col.render) return reactNodeToText(col.render(row));
  const raw = (row as Record<string, unknown>)[col.key];
  return raw == null ? "" : String(raw);
}

/** Text of a cell as displayed, for the CSV export (units and precision kept). */
function exportText<T>(col: Column<T>, row: T): string {
  if (col.render) {
    return reactNodeToText(col.render(row)).replace(/\s+/g, " ").trim();
  }
  const raw = (row as Record<string, unknown>)[col.key];
  return raw == null ? "" : String(raw);
}

/** Achata um ReactNode em texto plano para filtro/sort por substring. */
function reactNodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(reactNodeToText).join(" ");
  if (
    typeof node === "object" &&
    "props" in node &&
    node.props != null &&
    typeof node.props === "object" &&
    "children" in node.props
  ) {
    return reactNodeToText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function sortKeyOf<T>(col: Column<T>, row: T): string | number {
  if (col.sortValue) return col.sortValue(row);
  const text = cellText(col, row);
  const asNum = Number(text);
  return text !== "" && !Number.isNaN(asNum) ? asNum : text.toLowerCase();
}

export function DataTable<T>({
  columns,
  rows,
  initialSort,
  globalSearch = true,
  initialPicks = {},
  initialQuery = "",
  className,
  maxHeight = "max-h-[70vh]",
  rowKey,
  statusTabs = true,
  pageSize: initialPageSize = 25,
  csvName = "openzcash-records.csv",
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(
    initialSort ?? null,
  );
  /** 0 = every row on one page (the production behaviour, for Ctrl+F). */
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [filters, setFilters] = useState<Record<string, string>>({});
  /** Valores marcados por coluna no modo "select" (vazio = sem filtro). */
  const [picks, setPicks] = useState<Record<string, string[]>>(initialPicks);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);

  const colByKey = useMemo(() => {
    const m = new Map<string, Column<T>>();
    for (const c of columns) m.set(c.key, c);
    return m;
  }, [columns]);

  /** Valores distintos (ordenados) por coluna "select", derivados das linhas. */
  const distinctByCol = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const col of columns) {
      if (col.filterType !== "select") continue;
      const set = new Set<string>();
      for (const row of rows) {
        const v = cellText(col, row).trim();
        if (v) set.add(v);
      }
      out.set(
        col.key,
        [...set].sort((a, b) => a.localeCompare(b)),
      );
    }
    return out;
  }, [columns, rows]);

  function hasColFilter(key: string): boolean {
    return (filters[key] ?? "").trim() !== "" || (picks[key] ?? []).length > 0;
  }

  function togglePick(key: string, value: string) {
    setPage(1);
    setPicks((prev) => {
      const cur = prev[key] ?? [];
      const next = cur.includes(value)
        ? cur.filter((v) => v !== value)
        : [...cur, value];
      return { ...prev, [key]: next };
    });
  }

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeText = Object.entries(filters).filter(
      ([, v]) => v.trim() !== "",
    );
    const activePicks = Object.entries(picks).filter(([, v]) => v.length > 0);

    return rows.filter((row) => {
      // AND entre os filtros por coluna (texto = substring).
      for (const [key, value] of activeText) {
        const col = colByKey.get(key);
        if (!col) continue;
        if (!cellText(col, row).toLowerCase().includes(value.toLowerCase())) {
          return false;
        }
      }
      // AND entre os filtros por coluna (select = pertence ao conjunto marcado).
      for (const [key, values] of activePicks) {
        const col = colByKey.get(key);
        if (!col) continue;
        if (!values.includes(cellText(col, row).trim())) return false;
      }
      // Search global: OR sobre todas as colunas.
      if (q !== "") {
        const hit = columns.some((col) =>
          cellText(col, row).toLowerCase().includes(q),
        );
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, filters, picks, query, columns, colByKey]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = colByKey.get(sort.key);
    if (!col) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    // Cópia imutável antes de ordenar.
    return [...filtered].sort((a, b) => {
      const va = sortKeyOf(col, a);
      const vb = sortKeyOf(col, b);
      // Only subtract when both keys are numbers; otherwise compare as strings
      // so a mixed number/string column still yields a total order.
      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * dir;
      }
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filtered, sort, colByKey]);

  const isFiltered =
    query.trim() !== "" ||
    Object.values(filters).some((v) => v.trim() !== "") ||
    Object.values(picks).some((v) => v.length > 0);

  function setColumnFilter(key: string, value: string) {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const statusColumn = statusTabs
    ? columns.find(
        (c) => c.filterType === "select" && /status|verdict/i.test(c.key),
      )
    : undefined;
  const statusValues = statusColumn
    ? (distinctByCol.get(statusColumn.key) ?? [])
    : [];
  const effectiveSize = pageSize > 0 ? pageSize : Math.max(1, sorted.length);
  const pageCount = Math.max(1, Math.ceil(sorted.length / effectiveSize));
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice(
    (currentPage - 1) * effectiveSize,
    currentPage * effectiveSize,
  );
  const sizeOptions = [...new Set([...PAGE_SIZES, initialPageSize])]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const exportColumns = columns.filter((c) => c.csv !== false);
  const clear = () => {
    setQuery("");
    setFilters({});
    setPicks({});
    setPage(1);
  };
  return (
    <div className={cn("ws-data-table", className)}>
      {statusColumn && (
        <div
          className="ws-status-tabs"
          role="group"
          aria-label={`Filter by ${statusColumn.header}`}
        >
          {["", ...statusValues].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={
                value
                  ? (picks[statusColumn.key] ?? []).includes(value)
                  : !(picks[statusColumn.key] ?? []).length
              }
              onClick={() => {
                setPicks((p) => ({
                  ...p,
                  [statusColumn.key]: value ? [value] : [],
                }));
                setPage(1);
              }}
            >
              {value || "All"}
              <span>
                {value
                  ? rows.filter(
                      (r) => cellText(statusColumn, r).trim() === value,
                    ).length
                  : rows.length}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="ws-table-toolbar">
        {globalSearch && (
          <label className="ws-table-search">
            <span aria-hidden>⌕</span>
            <input
              type="search"
              aria-label="Search records"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search records…"
            />
          </label>
        )}
        <div className="ws-table-facets">
          {columns
            .filter((c) => c.filterType === "select" && c !== statusColumn)
            .map((col) => (
              <select
                key={col.key}
                aria-label={`Filter ${col.header}`}
                value={
                  (picks[col.key] ?? []).length === 1 ? picks[col.key][0] : ""
                }
                onChange={(e) => {
                  setPicks((p) => ({
                    ...p,
                    [col.key]: e.target.value ? [e.target.value] : [],
                  }));
                  setPage(1);
                }}
              >
                <option value="">
                  All{" "}
                  {col.header === "Category"
                    ? "categories"
                    : col.header.toLowerCase() + "s"}
                </option>
                {(distinctByCol.get(col.key) ?? []).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            ))}
          {isFiltered && (
            <button
              type="button"
              className="ws-button ws-button-quiet"
              onClick={clear}
            >
              Clear filters
            </button>
          )}
          <button
            type="button"
            className="ws-button"
            onClick={() =>
              downloadTableCsv(
                exportColumns.map((c) => c.header),
                sorted.map((row) =>
                  exportColumns.map((col) => exportText(col, row)),
                ),
                csvName,
              )
            }
          >
            ↓ Export CSV
          </button>
        </div>
      </div>
      <div className={cn("overflow-auto scroll-thin", maxHeight)}>
        <table className="w-full text-left text-sm" aria-label="Records">
          <thead className="tbl-head text-[11px] uppercase tracking-wider text-stone-600">
            <tr className="border-b border-stone-200">
              {columns.map((col) => {
                const align = ALIGN_CLASS[col.align ?? "left"];
                const isSorted = sort?.key === col.key;
                const isOpen = openFilter === col.key;
                const hasFilter = hasColFilter(col.key);
                const isSelect = col.filterType === "select";
                const options = distinctByCol.get(col.key) ?? [];
                const selected = picks[col.key] ?? [];
                return (
                  <th
                    key={col.key}
                    aria-sort={
                      isSorted
                        ? sort?.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={cn(
                      "px-4 py-3 font-medium align-bottom",
                      align,
                      col.mobileHidden && "ws-optional-column",
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-1.5",
                        col.align === "right" && "justify-end",
                        col.align === "center" && "justify-center",
                      )}
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className="group/sort inline-flex items-center gap-1.5 whitespace-nowrap uppercase tracking-wider transition-colors hover:text-stone-900"
                        >
                          <span>{col.header}</span>
                          <SortIcon
                            state={isSorted ? (sort?.dir ?? "none") : "none"}
                          />
                        </button>
                      ) : (
                        <span className="whitespace-nowrap">{col.header}</span>
                      )}

                      {col.filterable ? (
                        <button
                          type="button"
                          onClick={() =>
                            setOpenFilter((prev) =>
                              prev === col.key ? null : col.key,
                            )
                          }
                          aria-label={`Filter ${col.header}`}
                          className={cn(
                            "inline-flex items-center rounded-md p-1 transition-colors",
                            isOpen || hasFilter
                              ? "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/20"
                              : "text-stone-300 hover:bg-stone-100 hover:text-stone-600",
                          )}
                        >
                          <FunnelIcon active={isOpen || hasFilter} />
                        </button>
                      ) : null}
                    </div>

                    {col.filterable && isOpen ? (
                      isSelect ? (
                        <div
                          className={cn(
                            "mt-1.5 max-h-56 w-max min-w-[9rem] max-w-[16rem] overflow-auto rounded-lg bg-white p-1 text-xs font-normal normal-case tracking-normal shadow-lg ring-1 ring-stone-200",
                            col.align === "right" && "ml-auto",
                          )}
                        >
                          {selected.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPicks((p) => ({ ...p, [col.key]: [] }))
                              }
                              className="mb-1 block w-full rounded px-2 py-1 text-left text-[11px] text-stone-600 hover:bg-stone-100"
                            >
                              Clear ({selected.length})
                            </button>
                          ) : null}
                          {options.length === 0 ? (
                            <p className="px-2 py-1 text-stone-600">
                              No values
                            </p>
                          ) : (
                            options.map((opt) => {
                              const on = selected.includes(opt);
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => togglePick(col.key, opt)}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-stone-700 hover:bg-stone-100"
                                >
                                  <span
                                    className={cn(
                                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] ring-1 ring-inset",
                                      on
                                        ? "bg-amber-500 text-white ring-amber-500"
                                        : "bg-white ring-stone-300",
                                    )}
                                  >
                                    {on ? (
                                      <svg
                                        width="9"
                                        height="9"
                                        viewBox="0 0 10 10"
                                        fill="none"
                                        aria-hidden
                                      >
                                        <path
                                          d="M1.5 5.2 L4 7.5 L8.5 2.5"
                                          stroke="currentColor"
                                          strokeWidth="1.6"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                      </svg>
                                    ) : null}
                                  </span>
                                  <span className="truncate">{opt}</span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      ) : (
                        <input
                          type="text"
                          autoFocus
                          value={filters[col.key] ?? ""}
                          onChange={(e) =>
                            setColumnFilter(col.key, e.target.value)
                          }
                          placeholder="Filter…"
                          className="mt-1.5 w-full rounded bg-white px-2 py-1 text-xs font-normal normal-case tracking-normal text-stone-800 ring-1 ring-stone-200 placeholder:text-stone-600 focus:ring-amber-500/40"
                        />
                      )
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr
                key={
                  rowKey ? rowKey(row) : (currentPage - 1) * effectiveSize + i
                }
                className="tbl-row border-b border-stone-200 last:border-0"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-4 py-2.5 text-stone-700",
                      ALIGN_CLASS[col.align ?? "left"],
                      col.align === "right" && "tnum",
                      col.mobileHidden && "ws-optional-column",
                    )}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-stone-600"
                >
                  No rows match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="ws-table-footer">
        <span>
          {sorted.length ? (currentPage - 1) * effectiveSize + 1 : 0}–
          {Math.min(currentPage * effectiveSize, sorted.length)} of{" "}
          {sorted.length} records
          {isFiltered ? ` · ${rows.length} before filters` : ""}
        </span>
        <div>
          <label className="ws-table-pagesize">
            <span>Rows</span>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {sizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value={0}>All</option>
            </select>
          </label>
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
            aria-label="Previous page"
          >
            ←
          </button>
          <span>
            {currentPage} / {pageCount}
          </span>
          <button
            type="button"
            disabled={currentPage === pageCount}
            onClick={() => setPage(currentPage + 1)}
            aria-label="Next page"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

/** Two-arrow sort glyph: the active direction lights up amber, the other dims. */
function SortIcon({ state }: { state: "none" | "asc" | "desc" }) {
  return (
    <svg
      width="9"
      height="13"
      viewBox="0 0 9 13"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M4.5 0.5 L7.5 4 H1.5 Z"
        className={cn(
          "transition-colors",
          state === "asc"
            ? "fill-amber-600"
            : "fill-stone-300 group-hover/sort:fill-stone-400",
        )}
      />
      <path
        d="M4.5 12.5 L1.5 9 H7.5 Z"
        className={cn(
          "transition-colors",
          state === "desc"
            ? "fill-amber-600"
            : "fill-stone-300 group-hover/sort:fill-stone-400",
        )}
      />
    </svg>
  );
}

/** Funnel filter glyph using currentColor; fills softly when a filter is on. */
function FunnelIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M1.75 3 H12.25 L8.25 7.5 V11 L5.75 12.25 V7.5 Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        className={active ? "fill-amber-500/20" : "fill-none"}
      />
    </svg>
  );
}
