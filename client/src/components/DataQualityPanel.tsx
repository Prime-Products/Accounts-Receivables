/**
 * Data quality panel for the Address Book. Every check is derived live from the
 * directory, so the list shrinks as the user fixes things; duplicates open the
 * merge dialog directly.
 */
import { MergeContactsDialog, type MergeCandidate } from "@/components/MergeContactsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Building2, CheckCircle2, ChevronRight, Merge, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Section = {
  key: string;
  title: string;
  hint: string;
  count: number;
  render: () => React.ReactNode;
};

export function DataQualityPanel() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.addressBook.quality.useQuery(undefined, { enabled: open });
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Suggested rows the user has un-ticked, so a bad guess is never applied. */
  const [rejected, setRejected] = useState<number[]>([]);

  const refreshAfterTypeChange = () => {
    utils.addressBook.quality.invalidate();
    utils.addressBook.contacts.invalidate();
    utils.paymentContacts.invalidate();
  };
  const setType = trpc.addressBook.setContactType.useMutation({
    onSuccess: () => {
      toast.success("Marked as department");
      refreshAfterTypeChange();
    },
    onError: e => toast.error(e.message),
  });
  const setTypeBulk = trpc.addressBook.setContactTypeBulk.useMutation({
    onSuccess: r => {
      toast.success(`${r.updated} contact${r.updated === 1 ? "" : "s"} marked as department`);
      setRejected([]);
      refreshAfterTypeChange();
    },
    onError: e => toast.error(e.message),
  });

  const contactList = (rows: { id: number; name: string; email: string; companyName: string }[]) => (
    <ul className="divide-y text-sm">
      {rows.slice(0, 50).map(r => (
        <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
          <span className="min-w-0">
            <span className="block truncate">{r.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {r.email || "no email"} · {r.companyName}
            </span>
          </span>
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => window.dispatchEvent(new CustomEvent("address-book:open", { detail: { entity: "contact", recordKey: String(r.id) } }))}
          >
            Open
          </button>
        </li>
      ))}
      {rows.length > 50 && (
        <li className="px-3 py-1.5 text-xs text-muted-foreground">+{rows.length - 50} more</li>
      )}
    </ul>
  );

  const duplicateList = (
    groups: { key: string; label: string; contacts: MergeCandidate[] }[],
  ) => (
    <ul className="divide-y text-sm">
      {groups.slice(0, 50).map(g => (
        <li key={g.key} className="flex items-center justify-between gap-2 px-3 py-1.5">
          <span className="min-w-0">
            <span className="block truncate">{g.label}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {g.contacts.length} records · {g.contacts.map(c => c.companyName).join(", ")}
            </span>
          </span>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setMergeCandidates(g.contacts)}>
            <Merge className="h-3.5 w-3.5" /> Merge
          </Button>
        </li>
      ))}
      {groups.length > 50 && <li className="px-3 py-1.5 text-xs text-muted-foreground">+{groups.length - 50} more</li>}
    </ul>
  );

  const sections: Section[] = data
    ? [
        {
          key: "deptSuggest",
          title: "Possible departments filed as people",
          hint: "Shared mailboxes such as accounts@ or ops@ — review before applying",
          count: data.departmentSuggestions.length,
          render: () => {
            const pending = data.departmentSuggestions.filter(r => !rejected.includes(r.id));
            return (
              <div>
                <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">
                    {pending.length} of {data.departmentSuggestions.length} selected
                  </span>
                  <Button
                    size="sm"
                    className="ml-auto h-7 gap-1 text-xs"
                    disabled={pending.length === 0 || setTypeBulk.isPending}
                    onClick={() =>
                      setTypeBulk.mutate({ ids: pending.map(r => r.id), contactType: "Department" })
                    }
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    {setTypeBulk.isPending ? "Applying…" : `Mark ${pending.length} as department`}
                  </Button>
                </div>
                <ul className="divide-y text-sm">
                  {data.departmentSuggestions.slice(0, 100).map(r => {
                    const isRejected = rejected.includes(r.id);
                    return (
                      <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <span className={`min-w-0 ${isRejected ? "opacity-50 line-through" : ""}`}>
                          <span className="block truncate">{r.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {r.email} · {r.companyName}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={setType.isPending}
                            onClick={() => setType.mutate({ id: r.id, contactType: "Department" })}
                          >
                            Department
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() =>
                              setRejected(ids => (isRejected ? ids.filter(i => i !== r.id) : [...ids, r.id]))
                            }
                          >
                            {isRejected ? "Undo" : "Keep person"}
                          </Button>
                        </span>
                      </li>
                    );
                  })}
                  {data.departmentSuggestions.length > 100 && (
                    <li className="px-3 py-1.5 text-xs text-muted-foreground">
                      +{data.departmentSuggestions.length - 100} more — apply this batch to see the rest
                    </li>
                  )}
                </ul>
              </div>
            );
          },
        },
        {
          key: "dupEmail",
          title: "Duplicate email addresses",
          hint: "The same address on more than one contact",
          count: data.duplicateEmails.length,
          render: () => duplicateList(data.duplicateEmails as any),
        },
        {
          key: "dupName",
          title: "Same person twice in a company",
          hint: "Identical name inside the same company",
          count: data.duplicateNames.length,
          render: () => duplicateList(data.duplicateNames as any),
        },
        {
          key: "invalidEmail",
          title: "Invalid email addresses",
          hint: "Will bounce if you send a statement",
          count: data.invalidEmails.length,
          render: () => contactList(data.invalidEmails),
        },
        {
          key: "orphan",
          title: "Contacts without a company",
          hint: "The linked company no longer exists",
          count: data.orphanContacts.length,
          render: () => contactList(data.orphanContacts),
        },
        {
          key: "noPhone",
          title: "Contacts without a phone",
          hint: "Cannot be called for collections",
          count: data.missingPhone.length,
          render: () => contactList(data.missingPhone),
        },
        {
          key: "noContact",
          title: "Companies without any contact",
          hint: "Nobody to send a statement to",
          count: data.companiesWithoutContact.length,
          render: () => (
            <ul className="divide-y text-sm">
              {data.companiesWithoutContact.slice(0, 50).map(c => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.code} · {c.group}
                    </span>
                  </span>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("address-book:open", {
                          detail: { entity: "customer", recordKey: String(c.id) },
                        }),
                      )
                    }
                  >
                    Open
                  </button>
                </li>
              ))}
              {data.companiesWithoutContact.length > 50 && (
                <li className="px-3 py-1.5 text-xs text-muted-foreground">
                  +{data.companiesWithoutContact.length - 50} more
                </li>
              )}
            </ul>
          ),
        },
        {
          key: "noImo",
          title: "Vessels without an IMO number",
          hint: "Comes from the ERP / invoices",
          count: data.vesselsWithoutImo.length,
          render: () => (
            <ul className="divide-y text-sm">
              {data.vesselsWithoutImo.slice(0, 50).map(v => (
                <li key={v.id} className="px-3 py-1.5 truncate">
                  {v.name}
                </li>
              ))}
            </ul>
          ),
        },
        {
          key: "noOwner",
          title: "Vessels without an owner company",
          hint: "Cannot be billed to a group",
          count: data.vesselsWithoutOwner.length,
          render: () => (
            <ul className="divide-y text-sm">
              {data.vesselsWithoutOwner.slice(0, 50).map(v => (
                <li key={v.id} className="px-3 py-1.5 truncate">
                  {v.name}
                  {v.imo ? <span className="text-xs text-muted-foreground"> · IMO {v.imo}</span> : null}
                </li>
              ))}
            </ul>
          ),
        },
      ]
    : [];

  // Department suggestions are a housekeeping hint, not a data error, so they
  // stay out of the issue total.
  const issueTotal = sections.filter(s => s.key !== "deptSuggest").reduce((sum, s) => sum + s.count, 0);

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <ShieldCheck className="h-4 w-4" /> Data quality
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Data quality</DialogTitle>
          </DialogHeader>

          {isLoading || !data ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {issueTotal === 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> No issues found across{" "}
                    {data.totals.contacts.toLocaleString()} contacts.
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-600" /> {issueTotal.toLocaleString()} issue
                    {issueTotal === 1 ? "" : "s"} across {data.totals.contacts.toLocaleString()} contacts,{" "}
                    {data.totals.customers.toLocaleString()} companies and {data.totals.vessels} vessels.
                    {data.totals.archivedContacts > 0 && ` ${data.totals.archivedContacts} archived.`}
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="font-mono">
                  {data.totals.people.toLocaleString()} people
                </Badge>
                <Badge
                  variant="outline"
                  className="border-violet-200 bg-violet-100 font-mono text-violet-700"
                >
                  {data.totals.departments.toLocaleString()} departments
                </Badge>
              </div>

              <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
                {sections.map(s => (
                  <div key={s.key} className="rounded-md border">
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/40"
                      onClick={() => setExpanded(expanded === s.key ? null : s.key)}
                    >
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                          expanded === s.key ? "rotate-90" : ""
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{s.hint}</span>
                      </span>
                      <Badge variant={s.count === 0 ? "secondary" : "outline"} className="shrink-0 font-mono">
                        {s.count.toLocaleString()}
                      </Badge>
                    </button>
                    {expanded === s.key && s.count > 0 && <div className="border-t">{s.render()}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {mergeCandidates && (
        <MergeContactsDialog
          candidates={mergeCandidates}
          open={!!mergeCandidates}
          onOpenChange={o => !o && setMergeCandidates(null)}
          onMerged={() => setMergeCandidates(null)}
        />
      )}
    </>
  );
}
