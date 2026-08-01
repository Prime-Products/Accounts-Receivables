/**
 * Shared list surface for every Address Book tab.
 *
 * One component drives all four entities so columns, sorting, sticky headers,
 * resizing and the "Show all" behaviour stay identical across the directory —
 * the same contract the transactions list follows elsewhere in AR Pro.
 */
import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

export type ColumnDef<Row> = {
  /** Stable key: used for widths, visibility, sorting and exports. */
  key: string;
  label: string;
  width: number;
  /** Value used for sorting and for the exported cell. */
  value: (row: Row) => string | number | null;
  /** Optional custom cell renderer; defaults to the raw value. */
  render?: (row: Row) => ReactNode;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  /** Marks ERP-owned columns, shown with a lock hint in the column picker. */
  readOnly?: boolean;
};

export type SortState = { key: string | null; dir: "asc" | "desc" };

/** Case-insensitive comparison that keeps numbers numeric and blanks last. */
export function compareValues(a: string | number | null, b: string | number | null, dir: "asc" | "desc") {
  const empty = (v: string | number | null) => v === null || v === undefined || v === "";
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1;
  if (empty(b)) return -1;
  let diff: number;
  if (typeof a === "number" && typeof b === "number") diff = a - b;
  else diff = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return dir === "asc" ? diff : -diff;
}

export function AddressBookTable<Row extends { recordKey: string }>({
  listKey,
  columns,
  rows,
  isLoading,
  sort,
  onSortChange,
  onRowClick,
  emptyMessage,
  maxHeight = 560,
  pageSize = 100,
}: {
  listKey: string;
  columns: ColumnDef<Row>[];
  rows: Row[];
  isLoading?: boolean;
  sort: SortState;
  onSortChange: (next: SortState) => void;
  onRowClick?: (row: Row) => void;
  emptyMessage: string;
  maxHeight?: number;
  pageSize?: number;
}) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const widthDefaults = useMemo(() => Object.fromEntries(columns.map(c => [c.key, c.width])), [columns]);
  const cols = useResizableColumns(listKey, widthDefaults);

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return rows;
    return [...rows].sort((a, b) => compareValues(col.value(a), col.value(b), sort.dir));
  }, [rows, sort, columns]);

  const visible = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);

  const toggleSort = (key: string) =>
    onSortChange(sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const alignClass = (align?: string) =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <Table
          className="table-fixed"
          style={{ width: cols.totalWidth, minWidth: "100%" }}
          containerClassName="overflow-auto"
          containerStyle={{ maxHeight }}
        >
          <TableHeader className="sticky top-0 z-20">
            <TableRow>
              {columns.map(c => (
                <TableHead
                  key={c.key}
                  className={`relative bg-muted/60 backdrop-blur-sm font-semibold text-foreground ${alignClass(c.align)}`}
                  style={cols.style(c.key)}
                >
                  {c.sortable === false ? (
                    <span className="block truncate pr-1">{c.label}</span>
                  ) : (
                    <button
                      className={`inline-flex items-center gap-1 hover:text-foreground w-full max-w-full pr-1 ${
                        c.align === "right" ? "justify-end" : c.align === "center" ? "justify-center" : ""
                      }`}
                      onClick={() => toggleSort(c.key)}
                      title={`Sort by ${c.label}`}
                    >
                      <span className="truncate">{c.label}</span>
                      {sort.key === c.key ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3 shrink-0" />
                        ) : (
                          <ArrowDown className="h-3 w-3 shrink-0" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40 shrink-0" />
                      )}
                    </button>
                  )}
                  <ColResizer col={c.key} api={cols} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-10">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              visible.map(row => (
                <TableRow
                  key={row.recordKey}
                  className={onRowClick ? "cursor-pointer hover:bg-muted/40 transition-colors" : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map(c => {
                    const raw = c.value(row);
                    return (
                      <TableCell key={c.key} className={`truncate ${alignClass(c.align)}`} style={cols.style(c.key)}>
                        {c.render ? c.render(row) : raw === null || raw === "" ? "—" : String(raw)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            Showing {visible.length.toLocaleString()} of {sorted.length.toLocaleString()} record
            {sorted.length === 1 ? "" : "s"}
          </p>
          {sorted.length > visible.length && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setVisibleCount(v => v + 200)}>
                Show 200 more
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setVisibleCount(sorted.length)}>
                Show all ({sorted.length.toLocaleString()})
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
