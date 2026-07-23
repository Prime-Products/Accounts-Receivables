import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Building2, FileText, ListChecks, Search, StickyNote, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

/** Global search bar (command-palette style) that searches groups, companies, invoices, notes, and tasks. */
export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Ctrl/Cmd+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const enabled = debounced.length >= 2;
  const { data, isFetching } = trpc.customers.search.useQuery(
    { query: debounced },
    { enabled, staleTime: 30_000 },
  );

  const go = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  const hasResults =
    !!data && (data.groups.length > 0 || data.companies.length > 0 || data.invoices.length > 0 || data.notes.length > 0 || data.tasks.length > 0);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors w-full sm:w-72"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search groups, invoices, notes…</span>
        <kbd className="hidden sm:inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px]">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Global search" description="Search groups, companies, invoices, notes and tasks">
        <CommandInput placeholder="Type at least 2 characters…" value={query} onValueChange={setQuery} />
        <CommandList>
          {!enabled ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Search groups, companies, invoices, notes and tasks.</div>
          ) : isFetching && !data ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Searching…</div>
          ) : !hasResults ? (
            <CommandEmpty>No results for “{debounced}”.</CommandEmpty>
          ) : (
            <>
              {data!.groups.length > 0 && (
                <CommandGroup heading="Groups">
                  {data!.groups.map(g => (
                    <CommandItem key={`g-${g.name}`} value={`group ${g.name}`} onSelect={() => go(`/groups/${encodeURIComponent(g.name)}`)}>
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{g.name}</span>
                      <span className="text-xs text-muted-foreground">{g.members} member{g.members === 1 ? "" : "s"}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {data!.companies.length > 0 && (
                <CommandGroup heading="Companies">
                  {data!.companies.map(c => (
                    <CommandItem key={`c-${c.id}`} value={`company ${c.name} ${c.code}`} onSelect={() => go(`/customers/${c.id}`)}>
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{c.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {data!.invoices.length > 0 && (
                <CommandGroup heading="Invoices">
                  {data!.invoices.map(i => (
                    <CommandItem key={`i-${i.id}`} value={`invoice ${i.invoiceNumber}`} onSelect={() => go(`/invoices?q=${encodeURIComponent(i.invoiceNumber)}`)}>
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono">{i.invoiceNumber}</span>
                      <span className="flex-1 truncate text-xs text-muted-foreground">{i.customerName}</span>
                      <span className="font-mono text-xs">{fmtEur(i.amount)}</span>
                      <Badge variant="outline" className="text-[10px]">{i.status}</Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {data!.notes.length > 0 && (
                <CommandGroup heading="Notes">
                  {data!.notes.map(n => (
                    <CommandItem key={`n-${n.id}`} value={`note ${n.id} ${n.excerpt}`} onSelect={() => go(`/groups/${encodeURIComponent(n.group)}`)}>
                      <StickyNote className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm">{n.excerpt}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {n.group} · {new Date(n.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {data!.tasks.length > 0 && (
                <CommandGroup heading="Tasks">
                  {data!.tasks.map(t => (
                    <CommandItem key={`t-${t.id}`} value={`task ${t.id} ${t.title}`} onSelect={() => go("/tasks")}>
                      <ListChecks className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{t.title}</span>
                      {t.group && <span className="text-xs text-muted-foreground truncate max-w-32">{t.group}</span>}
                      <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

