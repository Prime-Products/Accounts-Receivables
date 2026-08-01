/**
 * Review queue for imported gift-list rows that could not be matched with
 * certainty. Nothing here has touched the gift list yet: the reviewer either
 * picks the right contact (which adds them to that year's list) or dismisses the
 * row. Rows are grouped by why they need attention, because the decisions differ:
 * a "probable" row needs a yes/no, an "unmatched" row needs a search.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Check, ChevronRight, Gift, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type ReviewItem = {
  id: number;
  year: number;
  sourceName: string;
  sourceGroup: string | null;
  region: string | null;
  tier: string;
  comment: string | null;
  matchKind: string;
  candidates: { id: number; name: string; email?: string | null; company?: string | null; group?: string | null }[];
};

const KIND_LABEL: Record<string, { title: string; hint: string }> = {
  probable: {
    title: "Probably these people",
    hint: "A likely contact was found, but the spelling differs — confirm the right one",
  },
  weak: {
    title: "Possible namesakes",
    hint: "A contact shares part of the name; most of these are different people",
  },
  unmatched: {
    title: "Not found in the directory",
    hint: "Nobody matches this name — search for them, or leave it for a new contact",
  },
  count_request: {
    title: "Quantities, not names",
    hint: 'The list held a number (e.g. "35 gifts") instead of a person',
  },
};

/** One queued row, with its candidates and a manual search fallback. */
function ReviewRow({
  item,
  onResolve,
  onDismiss,
  busy,
}: {
  item: ReviewItem;
  onResolve: (contactId: number) => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const [term, setTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const search = trpc.addressBook.search.useQuery(
    { query: term },
    { enabled: searching && term.trim().length >= 2 },
  );
  const searchHits = search.data?.contacts ?? [];

  return (
    <li className="space-y-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{item.sourceName}</span>
        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
          {item.tier}
        </Badge>
        {item.region && <span className="text-xs text-muted-foreground">{item.region}</span>}
        {item.sourceGroup && (
          <span className="truncate text-xs text-muted-foreground">· {item.sourceGroup}</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1 text-xs text-muted-foreground"
          disabled={busy}
          onClick={onDismiss}
        >
          <X className="h-3 w-3" /> Skip
        </Button>
      </div>
      {item.comment && <p className="text-xs text-muted-foreground">Note: {item.comment}</p>}

      {item.candidates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.candidates.map(c => (
            <Button
              key={c.id}
              variant="outline"
              size="sm"
              className="h-auto min-w-0 max-w-full flex-col items-start gap-0 px-2 py-1 text-left"
              disabled={busy}
              onClick={() => onResolve(c.id)}
            >
              <span className="flex items-center gap-1 truncate text-xs font-medium">
                <Check className="h-3 w-3 shrink-0 text-emerald-600" />
                {c.name}
              </span>
              <span className="truncate text-[11px] font-normal text-muted-foreground">
                {c.company ?? c.group ?? c.email ?? ""}
              </span>
            </Button>
          ))}
        </div>
      )}

      {searching ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={term}
              placeholder="Search contacts by name…"
              className="h-7 text-xs"
              onChange={e => setTerm(e.target.value)}
            />
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSearching(false)}>
              Cancel
            </Button>
          </div>
          {term.trim().length >= 2 && (
            <div className="max-h-40 overflow-auto rounded border">
              {search.isLoading && <p className="px-2 py-1.5 text-xs text-muted-foreground">Searching…</p>}
              {!search.isLoading && searchHits.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">No contact matches that name.</p>
              )}
              {searchHits.slice(0, 25).map(c => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => onResolve(c.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {c.companyName ?? c.email}
                    </span>
                  </span>
                  <Check className="h-3 w-3 shrink-0 text-emerald-600" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={() => setSearching(true)}
        >
          <Search className="h-3 w-3" /> Find the right contact
        </Button>
      )}
    </li>
  );
}

export function GiftReviewPanel() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>("probable");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.addressBook.giftReview.useQuery(undefined, { enabled: open });

  const refresh = () => {
    utils.addressBook.giftReview.invalidate();
    utils.addressBook.contacts.invalidate();
  };
  const resolve = trpc.addressBook.resolveGiftReview.useMutation({
    onSuccess: r => {
      toast.success(`Added to the ${r.year} gift list`);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const dismiss = trpc.addressBook.dismissGiftReview.useMutation({
    onSuccess: r => {
      toast.success(`${r.dismissed} row${r.dismissed === 1 ? "" : "s"} skipped`);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const busy = resolve.isPending || dismiss.isPending;

  const groups = useMemo(() => {
    const items = (data?.items ?? []) as ReviewItem[];
    return (["probable", "unmatched", "weak", "count_request"] as const)
      .map(kind => ({ kind, rows: items.filter(i => i.matchKind === kind) }))
      .filter(g => g.rows.length > 0);
  }, [data]);

  const pending = data?.counts.total ?? 0;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Gift className="h-4 w-4" /> Gift review
        {pending > 0 && (
          <Badge variant="outline" className="ml-1 bg-amber-50 text-amber-800 border-amber-200">
            {pending}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-amber-600" /> Gift list review
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Names from the imported gift list that need a decision. Confirmed matches are already on the
              list; nothing below has been applied.
            </p>
          </DialogHeader>

          <div className="max-h-[68vh] space-y-3 overflow-auto px-6 py-4">
            {isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}
            {!isLoading && groups.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nothing left to review — every gift-list name has been decided.
              </p>
            )}
            {groups.map(g => {
              const meta = KIND_LABEL[g.kind] ?? { title: g.kind, hint: "" };
              const isOpen = expanded === g.kind;
              return (
                <section key={g.kind} className="rounded-lg border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                    onClick={() => setExpanded(isOpen ? null : g.kind)}
                  >
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{meta.title}</span>
                      <span className="block text-xs text-muted-foreground">{meta.hint}</span>
                    </span>
                    <Badge variant="outline">{g.rows.length}</Badge>
                  </button>
                  {isOpen && (
                    <>
                      <div className="flex items-center justify-end border-t px-3 py-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs text-muted-foreground"
                          disabled={busy}
                          onClick={() => dismiss.mutate({ ids: g.rows.map(r => r.id) })}
                        >
                          <X className="h-3 w-3" /> Skip all {g.rows.length}
                        </Button>
                      </div>
                      <ul className="divide-y border-t">
                        {g.rows.map(item => (
                          <ReviewRow
                            key={item.id}
                            item={item}
                            busy={busy}
                            onResolve={contactId => resolve.mutate({ id: item.id, contactId })}
                            onDismiss={() => dismiss.mutate({ ids: [item.id] })}
                          />
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
