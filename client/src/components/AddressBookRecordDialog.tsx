/**
 * Modal wrapper around the shared record card.
 *
 * The body itself lives in `RecordDetailsPanel`, which the group and company
 * cards render as their "Details" tab — one template, two hosts, no drift.
 */
import { RecordDetailsPanel, type RecordTarget } from "@/components/RecordDetailsPanel";
import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Mail, Ship, Users } from "lucide-react";

export type { AddressBookEntity, RecordTarget } from "@/components/RecordDetailsPanel";

export function AddressBookRecordDialog({
  target,
  open,
  onOpenChange,
}: {
  target: RecordTarget | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const entity = target?.entity ?? "group";
  const recordKey = target?.recordKey ?? "";

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

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          <RecordDetailsPanel
            entity={entity}
            recordKey={recordKey}
            enabled={open}
            onOpenRecord={openRecord}
          />
        </div>
      </ResizableDialogContent>
    </Dialog>
  );
}
