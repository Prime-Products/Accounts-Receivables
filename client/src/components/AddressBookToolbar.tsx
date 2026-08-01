/**
 * Toolbar pieces shared by every Address Book tab: the column picker (visibility
 * and order, persisted per user through `addressBook.saveLayout`) and the export
 * menu, which exports exactly the columns and rows currently on screen.
 */
import type { ColumnDef } from "@/components/AddressBookTable";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { downloadBase64 } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ChevronDown, ChevronUp, Columns3, FileDown, Lock, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export function ColumnPicker<Row extends { recordKey: string }>({
  allColumns,
  hidden,
  order,
  onChange,
}: {
  allColumns: ColumnDef<Row>[];
  hidden: string[];
  order: string[];
  onChange: (next: { hidden: string[]; order: string[] }) => void;
}) {
  // Ordered list of every column, honouring the saved order and appending new ones.
  const ordered = [
    ...order.map(k => allColumns.find(c => c.key === k)).filter((c): c is ColumnDef<Row> => !!c),
    ...allColumns.filter(c => !order.includes(c.key)),
  ];
  const visibleCount = ordered.filter(c => !hidden.includes(c.key)).length;

  const move = (key: string, delta: number) => {
    const keys = ordered.map(c => c.key);
    const i = keys.indexOf(key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    onChange({ hidden, order: keys });
  };

  const toggle = (key: string) => {
    const next = hidden.includes(key) ? hidden.filter(k => k !== key) : [...hidden, key];
    // Never let the user hide every column — the list would be unreadable.
    if (next.length >= allColumns.length) {
      toast.error("Keep at least one column visible");
      return;
    }
    onChange({ hidden: next, order: ordered.map(c => c.key) });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Columns3 className="h-4 w-4" /> Columns
          <span className="text-xs text-muted-foreground">
            {visibleCount}/{allColumns.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-medium">Columns</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => onChange({ hidden: [], order: [] })}
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
        </div>
        <div className="max-h-80 overflow-auto py-1">
          {ordered.map((c, i) => (
            <div key={c.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50">
              <Checkbox
                id={`col-${c.key}`}
                checked={!hidden.includes(c.key)}
                onCheckedChange={() => toggle(c.key)}
              />
              <label htmlFor={`col-${c.key}`} className="flex-1 text-sm truncate cursor-pointer">
                {c.label}
              </label>
              {c.readOnly && (
                <span title="Comes from the ERP — read-only">
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </span>
              )}
              <div className="flex flex-col">
                <button
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => move(c.key, -1)}
                  title="Move up"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={i === ordered.length - 1}
                  onClick={() => move(c.key, 1)}
                  title="Move down"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ExportMenu<Row extends { recordKey: string }>({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: ColumnDef<Row>[];
  rows: Row[];
}) {
  const exportList = trpc.addressBook.export.useMutation({
    onSuccess: r => {
      downloadBase64(r.filename, r.mimeType, r.base64);
      toast.success("Export ready");
    },
    onError: e => toast.error(e.message),
  });

  const run = (format: "xlsx" | "pdf" | "csv") => {
    if (rows.length === 0) {
      toast.error("Nothing to export — the list is empty");
      return;
    }
    exportList.mutate({
      title,
      format,
      columns: columns.map(c => ({ header: c.label, key: c.key })),
      rows: rows.map(r => {
        const out: Record<string, string | number> = {};
        for (const c of columns) {
          const v = c.value(r);
          out[c.key] = v === null ? "" : v;
        }
        return out;
      }),
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={exportList.isPending}>
          <FileDown className="h-4 w-4" /> {exportList.isPending ? "Exporting…" : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("csv")}>CSV (.csv)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("pdf")}>PDF (.pdf)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
