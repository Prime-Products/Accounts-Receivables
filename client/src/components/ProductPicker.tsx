import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { fmtEur } from "@/lib/format";
import { Check, ChevronsUpDown, Package } from "lucide-react";

/** Where a pricelist entry comes from, shown as a small badge in the list. */
const sourceLabel: Record<string, string> = {
  product: "Equipment",
  consumable: "Consumable",
};

const sourceClasses: Record<string, string> = {
  product: "bg-purple-100 text-purple-800 border-purple-200",
  consumable: "bg-orange-100 text-orange-800 border-orange-200",
};

/**
 * Product picker for contract lines. The pricelist is the catalogue of what Prime
 * actually sells, so a product is chosen from it rather than typed: this keeps names,
 * cost and price identical across every contract. Free text is still allowed for the
 * odd one-off line, via the "use as typed" entry at the bottom of the list.
 */
export function ProductPicker({
  value,
  onSelectEntry,
  onFreeText,
}: {
  /** Currently chosen product name, empty when nothing is selected yet. */
  value: string;
  /** Called with the pricelist entry key when a catalogue item is chosen. */
  onSelectEntry: (key: string) => void;
  /** Called with a hand-typed name for products not in the pricelist. */
  onFreeText: (name: string) => void;
}) {
  const { data: pricelist } = trpc.opsCatalog.pricelist.useQuery();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const entries = pricelist ?? [];
  const typed = search.trim();
  /** A typed name that matches nothing can still be used as a one-off line. */
  const showFreeText = typed.length > 1 &&
    !entries.some(e => e.name.toLowerCase() === typed.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-background font-normal h-10"
        >
          <span className={`truncate ${value ? "" : "text-muted-foreground"}`}>
            {value || "Select a product from the pricelist..."}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter>
          <CommandInput placeholder="Search instrument, cylinder, part..." value={search} onValueChange={setSearch} />
          {/* Tall list: the catalogue is long, so more rows are visible at once. */}
          <CommandList className="max-h-[320px]">
            <CommandEmpty>
              {entries.length === 0
                ? "Pricelist is empty — add items under Prime 247 > Pricelist."
                : "No matching product."}
            </CommandEmpty>
            <CommandGroup>
              {entries.map(e => (
                <CommandItem
                  key={e.key}
                  // Searched text includes the category, so "cylinder" finds all of them.
                  value={`${e.name} ${e.category ?? ""} ${sourceLabel[e.source] ?? ""}`}
                  onSelect={() => {
                    onSelectEntry(e.key);
                    setSearch("");
                    setOpen(false);
                  }}
                  className="items-start gap-2"
                >
                  <Check className={`mt-0.5 h-4 w-4 shrink-0 ${value === e.name ? "opacity-100" : "opacity-0"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{e.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className={`text-[10px] px-1 py-0 ${sourceClasses[e.source] ?? ""}`}>
                        {sourceLabel[e.source] ?? e.source}
                      </Badge>
                      {e.category && <span className="text-[11px] text-muted-foreground truncate">{e.category}</span>}
                    </div>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    {fmtEur(Number(e.sellingPrice))}
                  </span>
                </CommandItem>
              ))}
              {showFreeText && (
                <CommandItem
                  value={typed}
                  onSelect={() => {
                    onFreeText(typed);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="truncate">Use "{typed}" as a one-off line</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
