/**
 * One card template for all four Address Book entities.
 *
 * The top block shows ERP-owned identity data (read-only), the middle block the
 * relationships (group → companies → vessels → contacts, each clickable), and the
 * bottom block the user's own custom fields. Contacts additionally expose their
 * editable details, since those are owned by AR Pro rather than the ERP.
 */
import { CustomFieldsBlock } from "@/components/CustomFieldsBlock";
import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { VesselDetailDialog } from "@/components/VesselDetailDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Building2, ExternalLink, Mail, Phone, Ship, Users } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export type AddressBookEntity = "group" | "customer" | "vessel" | "contact";

export type RecordTarget = {
  entity: AddressBookEntity;
  recordKey: string;
  title: string;
  subtitle?: string | null;
};

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="w-36 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

export function AddressBookRecordDialog({
  target,
  open,
  onOpenChange,
}: {
  target: RecordTarget | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const entity = target?.entity ?? "group";
  const recordKey = target?.recordKey ?? "";
  /** Vessel whose financial (AR) card is open on top of this one. */
  const [arVesselId, setArVesselId] = useState<number | null>(null);
  const utils = trpc.useUtils();
  /** Person ↔ Department is edited straight from the card and saved immediately. */
  const setContactType = trpc.addressBook.setContactType.useMutation({
    onSuccess: r => {
      toast.success(r.contactType === "Department" ? "Marked as department" : "Marked as person");
      utils.addressBook.contacts.invalidate();
      utils.addressBook.quality.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  /** Gift list membership is edited from the card too; the year comes from the row. */
  const setGift = trpc.addressBook.setContactGift.useMutation({
    onSuccess: () => {
      toast.success("Gift updated");
      utils.addressBook.contacts.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const removeGift = trpc.addressBook.removeContactGift.useMutation({
    onSuccess: () => {
      toast.success("Removed from the gift list");
      utils.addressBook.contacts.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  // The directory lists are already cached by the page, so these reads are cheap.
  const { data: groups } = trpc.addressBook.groups.useQuery(undefined, { enabled: open });
  const { data: customers } = trpc.addressBook.customers.useQuery(undefined, { enabled: open });
  const { data: vessels } = trpc.addressBook.vessels.useQuery(undefined, { enabled: open });
  const { data: contacts } = trpc.addressBook.contacts.useQuery(undefined, { enabled: open });

  const groupRow = entity === "group" ? groups?.find(g => g.recordKey === recordKey) : undefined;
  const customerRow = entity === "customer" ? customers?.find(c => c.recordKey === recordKey) : undefined;
  const vesselRow = entity === "vessel" ? vessels?.find(v => v.recordKey === recordKey) : undefined;
  const contactRow = entity === "contact" ? contacts?.find(c => c.recordKey === recordKey) : undefined;

  /** Group name of the open record, used to gather the related entities. */
  const groupName =
    groupRow?.group ?? customerRow?.group ?? vesselRow?.ownerGroup ?? contactRow?.group ?? null;

  const relatedCompanies = groupName ? (customers ?? []).filter(c => c.group === groupName) : [];
  const relatedVessels = groupName ? (vessels ?? []).filter(v => v.ownerGroup === groupName) : [];
  // The same person is registered on every company of a group, so show each one
  // once (keyed by email, or by name when there is none) instead of repeating.
  const relatedContacts = useMemo(() => {
    type ContactItem = NonNullable<typeof contacts>[number];
    const out: ContactItem[] = [];
    if (!groupName) return out;
    const seen = new Set<string>();
    for (const c of contacts ?? []) {
      if (c.group !== groupName) continue;
      const key = c.email?.trim().toLowerCase() || `n:${c.name?.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }, [contacts, groupName]);

  const openRecord = (next: RecordTarget) => {
    // Reuse the same dialog for the related record by swapping the target.
    onOpenChange(false);
    setTimeout(() => window.dispatchEvent(new CustomEvent("address-book:open", { detail: next })), 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ResizableDialogContent
        storageKey="address-book-record"
        defaultWidth={Math.min(1100, Math.floor(window.innerWidth * 0.92))}
        defaultHeight={Math.min(760, Math.floor(window.innerHeight * 0.88))}
        minWidth={520}
        minHeight={360}
        className="flex max-h-[96vh] max-w-[98vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[98vw]"
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            {entity === "group" && <Users className="h-5 w-5 text-sky-600" />}
            {entity === "customer" && <Building2 className="h-5 w-5 text-sky-600" />}
            {entity === "vessel" && <Ship className="h-5 w-5 text-sky-600" />}
            {entity === "contact" && <Mail className="h-5 w-5 text-sky-600" />}
            <span className="truncate">{target?.title}</span>
          </DialogTitle>
          {target?.subtitle && <p className="text-sm text-muted-foreground">{target.subtitle}</p>}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-6 py-4">
          {/* --- identity (ERP owned) --- */}
          <section className="rounded-lg border bg-card p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</p>
              {vesselRow && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setArVesselId(vesselRow.id)}
                >
                  <ExternalLink className="h-3 w-3" /> Open AR card
                </Button>
              )}
            </div>
            {!groupRow && !customerRow && !vesselRow && !contactRow && (
              <p className="py-2 text-sm text-muted-foreground">Loading record…</p>
            )}
            {groupRow && (
              <>
                <FieldRow label="Companies">{groupRow.companies}</FieldRow>
                <FieldRow label="Vessels">{groupRow.vessels}</FieldRow>
                <FieldRow label="Contacts">{groupRow.contacts}</FieldRow>
                <FieldRow label="ERP codes">{groupRow.codes || "—"}</FieldRow>
              </>
            )}
            {customerRow && (
              <>
                <FieldRow label="ERP code">{customerRow.code}</FieldRow>
                <FieldRow label="Group">{customerRow.group}</FieldRow>
                <FieldRow label="VAT number">{customerRow.vatNumber || "—"}</FieldRow>
                <FieldRow label="Email">{customerRow.email || "—"}</FieldRow>
                <FieldRow label="Phone">{customerRow.phone || "—"}</FieldRow>
                <FieldRow label="Contact person">{customerRow.contactPerson || "—"}</FieldRow>
                <FieldRow label="Payment terms">{customerRow.paymentTermsDays} days</FieldRow>
                <FieldRow label="Tier">
                  <Badge variant="outline">{customerRow.tier}</Badge>
                </FieldRow>
              </>
            )}
            {vesselRow && (
              <>
                <FieldRow label="IMO">{vesselRow.imo || "—"}</FieldRow>
                <FieldRow label="Type">{vesselRow.vesselType || "—"}</FieldRow>
                <FieldRow label="Flag">{vesselRow.flag || "—"}</FieldRow>
                <FieldRow label="Owner">{vesselRow.ownerName || "—"}</FieldRow>
                <FieldRow label="Group">{vesselRow.ownerGroup || "—"}</FieldRow>
              </>
            )}
            {contactRow && (
              <>
                <FieldRow label="Type">
                  <Select
                    value={contactRow.contactType === "Department" ? "Department" : "Person"}
                    disabled={setContactType.isPending}
                    onValueChange={v =>
                      setContactType.mutate({ id: contactRow.id, contactType: v as "Person" | "Department" })
                    }
                  >
                    <SelectTrigger className="h-7 w-[190px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Person">Person</SelectItem>
                      <SelectItem value="Department">Department (shared mailbox)</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>
                <FieldRow label="Position">{contactRow.title || "—"}</FieldRow>
                <FieldRow label="Gift list">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={contactRow.giftTier ?? "none"}
                      disabled={setGift.isPending || removeGift.isPending}
                      onValueChange={v => {
                        // The card always edits the current gift year: the row's own
                        // year when already on a list, otherwise the running year.
                        const year = contactRow.giftYear ?? new Date().getFullYear();
                        if (v === "none") removeGift.mutate({ contactId: contactRow.id, year });
                        else
                          setGift.mutate({
                            contactId: contactRow.id,
                            year,
                            tier: v as "Small" | "Medium" | "Special" | "Super Special" | "Whiskey",
                          });
                      }}
                    >
                      <SelectTrigger className="h-7 w-[190px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not on the gift list</SelectItem>
                        <SelectItem value="Small">Small</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Special">Special</SelectItem>
                        <SelectItem value="Super Special">Super Special</SelectItem>
                        <SelectItem value="Whiskey">Whiskey</SelectItem>
                      </SelectContent>
                    </Select>
                    {contactRow.giftYear ? (
                      <span className="text-xs text-muted-foreground">year {contactRow.giftYear}</span>
                    ) : null}
                    {(contactRow.giftHistory ?? []).length > 1 && (
                      <span className="text-xs text-muted-foreground">
                        history:{" "}
                        {(contactRow.giftHistory ?? [])
                          .map((g: { year: number; tier: string }) => `${g.year} ${g.tier}`)
                          .join(", ")}
                      </span>
                    )}
                  </div>
                </FieldRow>
                <FieldRow label="Email">
                  <a className="text-blue-600 hover:underline" href={`mailto:${contactRow.email}`}>
                    {contactRow.email}
                  </a>
                </FieldRow>
                <FieldRow label="Phone">
                  {contactRow.phone ? (
                    <a className="text-blue-600 hover:underline" href={`tel:${contactRow.phone}`}>
                      {contactRow.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </FieldRow>
                <FieldRow label="Company">{contactRow.companyName}</FieldRow>
                <FieldRow label="Group">{contactRow.group}</FieldRow>
              </>
            )}
          </section>

          {/* --- relationships --- */}
          <section className="flex min-h-0 flex-col space-y-2 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Related</p>
              {groupName && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => navigate(`/groups/${encodeURIComponent(groupName)}`)}
                >
                  <ExternalLink className="h-3 w-3" /> Open in Collections Desk
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <RelatedList
                title={`Companies (${relatedCompanies.length})`}
                items={relatedCompanies.map(c => ({
                  key: c.recordKey,
                  label: c.name,
                  onClick: () =>
                    openRecord({ entity: "customer", recordKey: c.recordKey, title: c.name, subtitle: c.group }),
                }))}
              />
              <RelatedList
                title={`Vessels (${relatedVessels.length})`}
                items={relatedVessels.map(v => ({
                  key: v.recordKey,
                  label: v.name,
                  onClick: () =>
                    openRecord({ entity: "vessel", recordKey: v.recordKey, title: v.name, subtitle: v.ownerGroup }),
                }))}
              />
              <RelatedList
                title={`Contacts (${relatedContacts.length})`}
                items={relatedContacts.map(c => ({
                  key: c.recordKey,
                  label: c.contactType === "Department" ? `${c.name} · dept` : c.name,
                  onClick: () =>
                    openRecord({ entity: "contact", recordKey: c.recordKey, title: c.name, subtitle: c.companyName }),
                }))}
              />
            </div>
          </section>

          {/* --- user-defined fields --- */}
          <section className="space-y-2 rounded-lg border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom fields</p>
            {target && <CustomFieldsBlock entity={entity} recordKey={recordKey} />}
          </section>
        </div>
      </ResizableDialogContent>

      {/* Financial view of the same vessel — opened on demand from the directory card. */}
      <VesselDetailDialog
        vesselId={arVesselId}
        open={arVesselId != null}
        onOpenChange={v => {
          if (!v) setArVesselId(null);
        }}
      />
    </Dialog>
  );
}

function RelatedList({
  title,
  items,
}: {
  title: string;
  items: { key: string; label: string; onClick: () => void }[];
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <p className="border-b bg-muted/40 px-2.5 py-1.5 text-xs font-medium">{title}</p>
      <div className="max-h-64 overflow-auto py-1">
        {items.length === 0 ? (
          <p className="px-2.5 py-2 text-xs text-muted-foreground">None</p>
        ) : (
          items.map(i => (
            <button
              key={i.key}
              className="block w-full truncate px-2.5 py-1 text-left text-xs text-sky-700 transition-colors hover:bg-accent"
              title={i.label}
              onClick={i.onClick}
            >
              {i.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
