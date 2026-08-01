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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { Building2, ExternalLink, Mail, Phone, Ship, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";

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
  const relatedContacts = groupName ? (contacts ?? []).filter(c => c.group === groupName) : [];

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
            {entity === "group" && <Users className="h-5 w-5" />}
            {entity === "customer" && <Building2 className="h-5 w-5" />}
            {entity === "vessel" && <Ship className="h-5 w-5" />}
            {entity === "contact" && <Mail className="h-5 w-5" />}
            <span className="truncate">{target?.title}</span>
          </DialogTitle>
          {target?.subtitle && <p className="text-sm text-muted-foreground">{target.subtitle}</p>}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-6 py-4">
          {/* --- identity (ERP owned) --- */}
          <section className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Details</p>
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
                <FieldRow label="Position">{contactRow.title || "—"}</FieldRow>
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
          <Separator />

          <section className="flex min-h-0 flex-col space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Related</p>
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
                  label: c.name,
                  onClick: () =>
                    openRecord({ entity: "contact", recordKey: c.recordKey, title: c.name, subtitle: c.companyName }),
                }))}
              />
            </div>
          </section>

          <Separator />

          {/* --- user-defined fields --- */}
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Custom fields</p>
            {target && <CustomFieldsBlock entity={entity} recordKey={recordKey} />}
          </section>
        </div>
      </ResizableDialogContent>
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
    <div className="rounded-md border">
      <p className="border-b px-2.5 py-1.5 text-xs font-medium">{title}</p>
      <div className="max-h-64 overflow-auto py-1">
        {items.length === 0 ? (
          <p className="px-2.5 py-2 text-xs text-muted-foreground">None</p>
        ) : (
          items.map(i => (
            <button
              key={i.key}
              className="block w-full truncate px-2.5 py-1 text-left text-xs hover:bg-accent"
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
