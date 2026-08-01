/**
 * Reusable column-resize infrastructure for data tables.
 *
 * Usage:
 *   const cols = useResizableColumns("invoices-table", { invoice: 110, customer: 170, ... });
 *   <Table style={{ tableLayout: "fixed", width: cols.totalWidth }}>
 *     <TableHead style={cols.style("invoice")}> Invoice <ColResizer col="invoice" api={cols} /> </TableHead>
 *
 * Widths are persisted per-table in localStorage, and a small "reset" is available
 * by double-clicking any resize handle.
 */
import * as React from "react";

export interface ResizableColumnsApi {
  widths: Record<string, number>;
  /** Inline style for a header/cell of the given column. */
  style: (col: string) => React.CSSProperties;
  /** Begin dragging a column's right edge. */
  startResize: (col: string, e: React.PointerEvent) => void;
  /** Reset all columns to their defaults. */
  reset: () => void;
  /** Sum of all column widths, used as the table's fixed width. */
  totalWidth: number;
  resizingCol: string | null;
}

const MIN_W = 48;
const MAX_W = 640;

export function useResizableColumns(
  storageKey: string,
  defaults: Record<string, number>,
  /**
   * Columns that must never be narrower than their default, whatever the user
   * previously saved. Used for cells whose content cannot shrink gracefully
   * (e.g. the status cell with a primary + Disputed badge side by side).
   */
  minWidths?: Record<string, number>,
): ResizableColumnsApi {
  const key = `col-widths:${storageKey}`;
  const [widths, setWidths] = React.useState<Record<string, number>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
      return { ...defaults, ...saved };
    } catch {
      return { ...defaults };
    }
  });
  const [resizingCol, setResizingCol] = React.useState<string | null>(null);
  const dragRef = React.useRef<{ col: string; startX: number; startW: number } | null>(null);

  // Keep any newly-added default columns in sync (e.g. after code updates).
  React.useEffect(() => {
    setWidths(w => {
      let changed = false;
      const next = { ...w };
      for (const k of Object.keys(defaults)) {
        if (next[k] == null) {
          next[k] = defaults[k];
          changed = true;
        }
      }
      return changed ? next : w;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persist = React.useCallback(
    (w: Record<string, number>) => {
      try {
        localStorage.setItem(key, JSON.stringify(w));
      } catch {
        /* ignore quota errors */
      }
    },
    [key],
  );

  const startResize = React.useCallback(
    (col: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { col, startX: e.clientX, startW: widths[col] ?? defaults[col] ?? 120 };
      setResizingCol(col);
      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const w = Math.min(MAX_W, Math.max(MIN_W, d.startW + (ev.clientX - d.startX)));
        setWidths(prev => ({ ...prev, [d.col]: w }));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setWidths(prev => {
          persist(prev);
          return prev;
        });
        dragRef.current = null;
        setResizingCol(null);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [widths, defaults, persist],
  );

  const reset = React.useCallback(() => {
    setWidths({ ...defaults });
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const style = React.useCallback(
    (col: string): React.CSSProperties => {
      const floor = minWidths?.[col];
      const w = floor != null ? Math.max(widths[col] ?? floor, floor) : widths[col];
      return { width: w, minWidth: w, maxWidth: w };
    },
    [widths, minWidths],
  );

  const totalWidth = React.useMemo(
    () =>
      Object.entries(widths).reduce((s, [col, w]) => {
        const floor = minWidths?.[col];
        return s + (floor != null ? Math.max(w, floor) : w);
      }, 0),
    [widths, minWidths],
  );

  return { widths, style, startResize, reset, totalWidth, resizingCol };
}

/** Drag handle rendered inside a TableHead. Double-click resets all widths. */
export function ColResizer({ col, api }: { col: string; api: ResizableColumnsApi }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize · double-click to reset all"
      onPointerDown={e => api.startResize(col, e)}
      onDoubleClick={e => {
        e.stopPropagation();
        api.reset();
      }}
      onClick={e => e.stopPropagation()}
      className={`absolute top-0 right-0 h-full w-2 cursor-col-resize select-none touch-none flex items-center justify-center group/resizer ${
        api.resizingCol === col ? "bg-primary/20" : "hover:bg-primary/10"
      }`}
    >
      <span
        className={`h-4/6 w-px transition-colors ${
          api.resizingCol === col ? "bg-primary" : "bg-border group-hover/resizer:bg-primary/60"
        }`}
      />
    </span>
  );
}
