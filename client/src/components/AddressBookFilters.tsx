/**
 * Column filters for the Address Book.
 *
 * Anything that is a column can be filtered — including custom fields, so a
 * user-defined "Region" or "Send SOA" field becomes a filter the moment it is
 * created. Each filter is a (column, operator, value) triple; they are ANDed.
 * `applyFieldFilters` is exported separately so tests can exercise the matching
 * logic without React.
 */
import type { ColumnDef } from "@/components/AddressBookTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, Plus, X } from "lucide-react";
import { useState } from "react";

export type FilterOp = "contains" | "equals" | "empty" | "notEmpty" | "gt" | "lt";

export type FieldFilter = {
  key: string; // column key
  op: FilterOp;
  value: string;
};

const OPS: { value: FilterOp; label: string; needsValue: boolean }[] = [
  { value: "contains", label: "contains", needsValue: true },
  { value: "equals", label: "is", needsValue: true },
  { value: "gt", label: "greater than", needsValue: true },
  { value: "lt", label: "less than", needsValue: true },
  { value: "empty", label: "is empty", needsValue: false },
  { value: "notEmpty", label: "is not empty", needsValue: false },
];

export function opNeedsValue(op: FilterOp) {
  return OPS.find(o => o.value === op)?.needsValue ?? true;
}

/** Applies every filter (AND) to the rows, reading values through the column defs. */
export function applyFieldFilters<Row>(
  rows: Row[],
  filters: FieldFilter[],
  columns: ColumnDef<Row>[],
): Row[] {
  const active = filters.filter(f => f.key && (opNeedsValue(f.op) ? f.value.trim() !== "" : true));
  if (active.length === 0) return rows;
  const byKey = new Map(columns.map(c => [c.key, c]));
  return rows.filter(row =>
    active.every(f => {
      const col = byKey.get(f.key);
      if (!col) return true;
      const raw = col.value(row);
      const text = raw === null || raw === undefined ? "" : String(raw).trim();
      const needle = f.value.trim();
      switch (f.op) {
        case "empty":
          return text === "" || text === "—";
        case "notEmpty":
          return text !== "" && text !== "—";
        case "equals":
          return text.toLowerCase() === needle.toLowerCase();
        case "gt":
        case "lt": {
          const a = Number(text.replace(/[^0-9.-]/g, ""));
          const b = Number(needle.replace(/[^0-9.-]/g, ""));
          if (Number.isNaN(a) || Number.isNaN(b)) return false;
          return f.op === "gt" ? a > b : a < b;
        }
        default:
          return text.toLowerCase().includes(needle.toLowerCase());
      }
    }),
  );
}

export function FieldFilterBar<Row extends { recordKey: string }>({
  columns,
  filters,
  onChange,
}: {
  columns: ColumnDef<Row>[];
  filters: FieldFilter[];
  onChange: (next: FieldFilter[]) => void;
}) {
  const [open, setOpen] = useState(false);
  // Action/blank columns cannot be filtered meaningfully.
  const filterable = columns.filter(c => c.label.trim() !== "");

  const add = () => {
    const first = filterable[0];
    if (!first) return;
    onChange([...filters, { key: first.key, op: "contains", value: "" }]);
    setOpen(true);
  };
  const update = (i: number, patch: Partial<FieldFilter>) =>
    onChange(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i: number) => onChange(filters.filter((_, idx) => idx !== i));

  const activeCount = filters.filter(f => (opNeedsValue(f.op) ? f.value.trim() !== "" : true)).length;
  const labelOf = (key: string) => filterable.find(c => c.key === key)?.label ?? key;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="h-4 w-4" /> Filters
            {activeCount > 0 && (
              <span className="rounded bg-primary px-1.5 text-xs text-primary-foreground">{activeCount}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[520px] p-3" align="start">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Filter on any column, including your own custom fields. All conditions must match.
            </p>
            {filters.length === 0 && <p className="py-2 text-sm text-muted-foreground">No filters yet.</p>}
            {filters.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Select value={f.key} onValueChange={v => update(i, { key: v })}>
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {filterable.map(c => (
                      <SelectItem key={c.key} value={c.key} className="text-xs">
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={f.op} onValueChange={v => update(i, { op: v as FilterOp })}>
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPS.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {opNeedsValue(f.op) ? (
                  <Input
                    className="h-8 flex-1 text-xs"
                    placeholder="Value…"
                    value={f.value}
                    onChange={e => update(i, { value: e.target.value })}
                  />
                ) : (
                  <div className="flex-1" />
                )}
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => remove(i)} title="Remove">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={add}>
                <Plus className="h-3.5 w-3.5" /> Add condition
              </Button>
              {filters.length > 0 && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onChange([])}>
                  Clear all
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {filters
        .filter(f => (opNeedsValue(f.op) ? f.value.trim() !== "" : true))
        .map((f, i) => (
          <Badge key={i} variant="secondary" className="gap-1 font-normal">
            {labelOf(f.key)} {OPS.find(o => o.value === f.op)?.label}
            {opNeedsValue(f.op) && ` "${f.value}"`}
            <button
              className="ml-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => remove(filters.indexOf(f))}
              title="Remove filter"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
    </div>
  );
}
