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
import { AlertTriangle, CheckCircle2, ChevronRight, Merge, ShieldCheck } from "lucide-react";
import { useState } from "react";

type Section = {
  key: string;
  title: string;
  hint: string;
  count: number;
  render: () => React.ReactNode;
};

export function DataQualityPanel() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = trpc.addressBook.quality.useQuery(undefined, { enabled: open });
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

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

  const issueTotal = sections.reduce((sum, s) => sum + s.count, 0);

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

