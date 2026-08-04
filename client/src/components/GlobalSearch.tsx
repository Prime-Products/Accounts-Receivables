import { Badge } from "@/components/ui/badge";
import { fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { scrollPageToTop } from "@/lib/scrollToTop";
import { normalizeRemittanceMethod } from "@shared/remittanceMethods";
import { ArrowLeftRight, Banknote, Building2, FileText, ListChecks, Loader2, Mail, Search, Ship, StickyNote, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

/**
 * Global inline search — available on every page (rendered in the app layout).
 * Click the input and type directly; results appear in a dropdown below.
 * No modal. Cmd/Ctrl+K focuses the input. Esc closes the dropdown.
 */
export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Ctrl/Cmd+K focuses the input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
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
    scrollPageToTop();
  };

  const hasResults =
    !!data &&
    (data.groups.length > 0 ||
      data.companies.length > 0 ||
      (data.contacts?.length ?? 0) > 0 ||
      (data.vessels?.length ?? 0) > 0 ||
      data.invoices.length > 0 ||
      data.notes.length > 0 ||
      data.tasks.length > 0 ||
      (data.transfers?.length ?? 0) > 0 ||
      (data.payments?.length ?? 0) > 0);

  const showDropdown = open && query.trim().length >= 2;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="py-1">
      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );

  const Row = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/70 transition-colors"
    >
      {children}
    </button>
  );

  return (
    <div ref={rootRef} className="relative w-full sm:w-80">
      <div className="flex items-center gap-2 rounded-md border bg-card px-3 h-9 text-sm focus-within:ring-2 focus-within:ring-ring/40">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Search people, vessels, companies, invoices…"
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-0"
        />
        {isFetching && enabled ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
        ) : query ? (
          <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="hidden sm:inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] shrink-0">⌘K</kbd>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-[70vh] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-lg">
          {!enabled || (isFetching && !data) ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
          ) : !hasResults ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No results for “{debounced}”.</div>
          ) : (
            <div className="divide-y">
              {data!.groups.length > 0 && (
                <Section title="Groups">
                  {data!.groups.map(g => (
                    <Row key={`g-${g.name}`} onClick={() => go(`/groups/${encodeURIComponent(g.name)}`)}>
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{g.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{g.members} member{g.members === 1 ? "" : "s"}</span>
                    </Row>
                  ))}
                </Section>
              )}
              {data!.companies.length > 0 && (
                <Section title="Companies">
                  {data!.companies.map(c => (
                    <Row key={`c-${c.id}`} onClick={() => go(`/customers/${c.id}`)}>
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="font-mono text-xs text-muted-foreground shrink-0">{c.code}</span>
                    </Row>
                  ))}
                </Section>
              )}
              {(data!.contacts?.length ?? 0) > 0 && (
                <Section title="People & departments">
                  {data!.contacts!.map(p => (
                    <Row
                      key={`ct-${p.id}`}
                      onClick={() =>
                        // Land on the contacts tab pre-filtered to this person, so the
                        // record card is one click away.
                        go(`/address-book?tab=contact&q=${encodeURIComponent(p.name)}`)
                      }
                    >
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">{p.name}</span>
                          {p.contactType === "Department" && (
                            <Badge variant="outline" className="shrink-0 text-[10px]">Dept</Badge>
                          )}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {[p.title, p.companyName ?? p.group, p.email].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </Row>
                  ))}
                </Section>
              )}
              {(data!.vessels?.length ?? 0) > 0 && (
                <Section title="Vessels">
                  {data!.vessels!.map(v => (
                    <Row key={`v-${v.id}`} onClick={() => go(`/vessels?q=${encodeURIComponent(v.name)}`)}>
                      <Ship className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{v.name}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {[v.vesselType, v.flag, v.companyName ?? v.group].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {v.imo && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">IMO {v.imo}</span>}
                    </Row>
                  ))}
                </Section>
              )}
              {data!.invoices.length > 0 && (
                <Section title="Invoices">
                  {data!.invoices.map(i => (
                    <Row key={`i-${i.id}`} onClick={() => go(`/invoices?q=${encodeURIComponent(i.invoiceNumber)}`)}>
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-mono shrink-0">{i.invoiceNumber}</span>
                      <span className="flex-1 truncate text-xs text-muted-foreground">
                        {i.customerName}
                        {(i as any).vesselName ? ` · ${(i as any).vesselName}` : ""}
                      </span>
                      <span className="font-mono text-xs shrink-0">{fmtEur(i.amount)}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{i.status}</Badge>
                    </Row>
                  ))}
                </Section>
              )}
              {(data!.payments?.length ?? 0) > 0 && (
                <Section title="Payments (allocations)">
                  {data!.payments!.map((p: any) => (
                    <Row key={`p-${p.id}`} onClick={() => go("/remittances")}>
                      <Banknote className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm">
                          <span className="font-mono">{p.invoiceNumber}</span>
                          <span className="text-muted-foreground"> paid by </span>
                          {p.payerName}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          from remittance {p.transferAmount?.toLocaleString()} {p.currency}
                          {p.transferReference ? ` · ref ${p.transferReference}` : ""} ·{" "}
                          {new Date(Number(p.transferDate)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </div>
                      <span className="font-mono text-xs shrink-0">
                        {Number(p.amount).toLocaleString()} {p.currency}
                      </span>
                    </Row>
                  ))}
                </Section>
              )}
              {(data!.transfers?.length ?? 0) > 0 && (
                <Section title="Remittances">
                  {data!.transfers!.map((t: any) => (
                    <Row key={`w-${t.id}`} onClick={() => go("/remittances")}>
                      <ArrowLeftRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">
                        {t.isInternal ? "Internal · " : ""}
                        {t.customerName}
                      </span>
                      {!t.isInternal && t.method && normalizeRemittanceMethod(t.method) !== "Transfer" && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {normalizeRemittanceMethod(t.method)}
                        </span>
                      )}
                      <span className="font-mono text-xs shrink-0">
                        {Number(t.amount).toLocaleString()} {t.currency}
                      </span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{t.status}</Badge>
                    </Row>
                  ))}
                </Section>
              )}
              {data!.notes.length > 0 && (
                <Section title="Notes">
                  {data!.notes.map(n => (
                    <Row key={`n-${n.id}`} onClick={() => go(`/groups/${encodeURIComponent(n.group)}`)}>
                      <StickyNote className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm">{n.excerpt}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {n.group} · {new Date(n.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </div>
                    </Row>
                  ))}
                </Section>
              )}
              {data!.tasks.length > 0 && (
                <Section title="Tasks">
                  {data!.tasks.map(t => (
                    <Row key={`t-${t.id}`} onClick={() => go("/tasks")}>
                      <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{t.title}</span>
                      {t.group && <span className="text-xs text-muted-foreground truncate max-w-32">{t.group}</span>}
                      <Badge variant="outline" className="text-[10px] shrink-0">{t.status}</Badge>
                    </Row>
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
