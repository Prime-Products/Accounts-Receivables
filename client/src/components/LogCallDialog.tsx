import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { trpc } from "@/lib/trpc";
import { fmtPromiseAmountShort } from "@/lib/format";
import { Building2, CheckCircle2, Info, Mail, Phone, Plus, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const OUTCOMES = ["Reached", "No Answer"] as const;
const CONFIRMATION_STATUSES = ["Not Contacted", "Confirmed", "Pending Follow-up", "Broken"] as const;
const STATUS_LABELS: Record<string, string> = {
  "Not Contacted": "Not Contacted",
  Confirmed: "Promise to Pay",
  "Pending Follow-up": "Pending Follow-up",
  Broken: "Broken",
};



export default function LogCallDialog({
  group,
  companies,
  defaultCustomerId,
  open,
  onOpenChange,
}: {
  group: string;
  companies?: { id: number; name: string }[];
  defaultCustomerId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [customerId, setCustomerId] = useState<number | null>(defaultCustomerId ?? null);
  const [contactName, setContactName] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  // Inline "add new contact" form state
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactTitle, setNewContactTitle] = useState("");
  const [newContactCustomerId, setNewContactCustomerId] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]>("Reached");
  const [notes, setNotes] = useState("");
  /**
   * `?response=Pending Follow-up` (or `Confirmed` / `Broken`) preselects the
   * customer response, so the expanded form can be linked to directly.
   */
  const initialResponse = () => {
    const v = new URLSearchParams(window.location.search).get("response") ?? "";
    return (CONFIRMATION_STATUSES as readonly string[]).includes(v)
      ? (v as (typeof CONFIRMATION_STATUSES)[number])
      : "";
  };
  const [confirmationStatus, setConfirmationStatus] = useState<(typeof CONFIRMATION_STATUSES)[number] | "">(initialResponse);
  const [confirmationAmount, setConfirmationAmount] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [promiseMode, setPromiseMode] = useState<"reschedule" | "new">("reschedule");
  const utils = trpc.useUtils();

  // Existing open promise for this group (offered for rescheduling on Confirmed)
  const { data: openPromise } = trpc.calls.getOpenPromise.useQuery({ group }, { enabled: open });
  // Payment contacts across all companies of the group
  const { data: groupContacts } = trpc.paymentContacts.listByGroup.useQuery({ group }, { enabled: open });
  // Collection notes (call preferences & particularities) — shown as a reminder before logging the call
  const { data: collectionProfile } = trpc.customers.getCollectionProfile.useQuery({ group }, { enabled: open });
  const selectedContact =
    selectedContactId && selectedContactId !== "other" && selectedContactId !== "add-new"
      ? groupContacts?.find(c => String(c.id) === selectedContactId)
      : undefined;



  useEffect(() => {
    if (open) {
      setCustomerId(defaultCustomerId ?? null);
      setContactName("");
      setSelectedContactId("");
      setNewContactName("");
      setNewContactEmail("");
      setNewContactPhone("");
      setNewContactTitle("");
      setNewContactCustomerId(null);
      setOutcome("Reached");
      setNotes("");
      setConfirmationStatus(initialResponse());
      setConfirmationAmount("");
      setFollowUpDate("");
      setPromisedDate("");
      setPromiseMode("reschedule");
    }
  }, [open, defaultCustomerId]);

  const logCall = trpc.calls.logCall.useMutation({
    onSuccess: (_data, variables) => {
      toast.success("Call logged");
      utils.customers.invalidate();
      utils.calls.invalidate();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const addContact = trpc.paymentContacts.add.useMutation({
    onSuccess: () => {
      utils.paymentContacts.listByGroup.invalidate();
      toast.success("Contact added");
      setNewContactName("");
      setNewContactEmail("");
      setNewContactPhone("");
      setNewContactTitle("");
      setNewContactCustomerId(null);
      setSelectedContactId("");
    },
    onError: e => toast.error(e.message),
  });

  const handleAddContact = () => {
    if (!newContactName.trim() || !newContactCustomerId) {
      toast.error("Name and company required");
      return;
    }
    addContact.mutate({
      customerId: newContactCustomerId,
      name: newContactName,
      email: newContactEmail || "",
      phone: newContactPhone || "",
      title: newContactTitle || "",
    });
  };

  const handleSubmit = () => {
    // "No Answer" means nobody spoke to us: there is no customer response to give,
    // so the call is recorded as a contact attempt and the status is left alone.
    if (outcome === "Reached" && !confirmationStatus) {
      toast.error("Select a response");
      return;
    }

    const logData: any = {
      group,
      outcome,
      // On a no-answer attempt we deliberately send no status change.
      confirmationStatus: outcome === "No Answer" ? undefined : confirmationStatus || "Not Contacted",
      notes: notes.trim() || undefined,
    };

    if (customerId) logData.customerId = customerId;
    if (selectedContactId && selectedContactId !== "other") {
      logData.contactId = parseInt(selectedContactId);
    } else if (selectedContactId === "other" && contactName.trim()) {
      logData.contactName = contactName;
    }

    if (outcome === "Reached" && confirmationStatus === "Confirmed") {
      logData.confirmationAmount = confirmationAmount ? parseFloat(confirmationAmount) : undefined;
      logData.promisedDate = promisedDate ? new Date(promisedDate).getTime() : undefined;
      logData.promiseMode = promiseMode;
    } else if (outcome === "Reached" && confirmationStatus === "Pending Follow-up") {
      logData.confirmationAmount = confirmationAmount ? parseFloat(confirmationAmount) : undefined;
      logData.followUpDate = followUpDate ? new Date(followUpDate).getTime() : undefined;
    }

    logCall.mutate(logData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Compact layout: the dialog is a flex column with a fixed header and a
        fixed footer, so Save/Cancel stay visible without scrolling. Only the
        middle body can ever scroll, and the fields are laid out in two columns
        on desktop so everything fits in one screen.
      */}
      <DialogContent className="sm:max-w-3xl max-h-[88vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 border-b px-5 py-3">
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-sky-600" /> Log Call — {group}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5">
          {collectionProfile?.notes?.trim() ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-1.5 flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  Collection Notes
                </div>
                <div className="text-xs text-amber-900 dark:text-amber-100 whitespace-pre-wrap break-words line-clamp-3">
                  {collectionProfile.notes.trim()}
                </div>
              </div>
            </div>
          ) : null}

          {/* Row 1: who we called — company / contact / outcome side by side */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {companies && companies.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs">Company (optional)</Label>
              <Select
                value={customerId ? String(customerId) : "all"}
                onValueChange={v => setCustomerId(v && v !== "all" ? parseInt(v) : null)}
              >
                <SelectTrigger className="w-full h-9">
                  <SelectValue placeholder="All companies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All companies</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}

          {/* Contact person selection */}
          <div className="space-y-1">
            <Label className="text-xs">Contact person</Label>
            <Select value={selectedContactId} onValueChange={setSelectedContactId}>
              <SelectTrigger className="w-full h-9">
                <SelectValue placeholder="Select contact…" />
              </SelectTrigger>
              <SelectContent>
                {groupContacts?.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {(c as { contactType?: string }).contactType === "Department"
                      ? `${c.name} · department`
                      : c.name}
                    {c.title ? ` (${c.title})` : ""}
                  </SelectItem>
                ))}
                <SelectItem value="other">Other (type a name)</SelectItem>
                <SelectItem value="add-new">+ Add new contact</SelectItem>
              </SelectContent>
            </Select>
            {selectedContactId === "other" && (
              <Input
                placeholder="Contact name"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                className="mt-1 h-9"
              />
            )}
            {selectedContact && (
                  <div className="rounded border bg-muted/40 px-2 py-1.5 text-xs mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      {(selectedContact as { contactType?: string }).contactType === "Department" ? (
                        <Building2 className="h-3 w-3 text-violet-600" />
                      ) : (
                        <User className="h-3 w-3" />
                      )}{" "}
                      {selectedContact.name}
                      {(selectedContact as { contactType?: string }).contactType === "Department" && (
                        <span className="rounded bg-violet-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                          Dept
                        </span>
                      )}
                      {selectedContact.title && <span className="text-muted-foreground font-normal">· {selectedContact.title}</span>}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      <a className="text-blue-600 hover:underline" href={`mailto:${selectedContact.email}`}>{selectedContact.email}</a>
                    </span>
                    {selectedContact.phone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <a className="text-blue-600 hover:underline" href={`tel:${selectedContact.phone}`}>{selectedContact.phone}</a>
                      </span>
                    )}
                  </div>
            )}
            {selectedContactId === "add-new" && (
              <div className="rounded border bg-muted/30 p-2 space-y-2 mt-1">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Name *"
                    value={newContactName}
                    onChange={e => setNewContactName(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Input className="h-8 text-xs" value={newContactTitle} onChange={e => setNewContactTitle(e.target.value)} placeholder="Title" />
                  <Input className="h-8 text-xs" type="email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} placeholder="Email *" />
                  <Input className="h-8 text-xs" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="Phone" />
                </div>
                <Button size="sm" className="h-7 text-xs w-full" onClick={handleAddContact} disabled={addContact.isPending}>
                  {addContact.isPending ? "Saving…" : "Save contact"}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Outcome</Label>
            <Select value={outcome} onValueChange={v => setOutcome(v as (typeof OUTCOMES)[number])}>
              <SelectTrigger className="w-full h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTCOMES.map(o => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Customer response sits next to Outcome — it drives the panel below */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">
              Customer Response {outcome === "Reached" ? "*" : <span className="font-normal text-muted-foreground">— n/a</span>}
            </Label>
            <Select
              value={confirmationStatus}
              onValueChange={(v) => setConfirmationStatus(v as (typeof CONFIRMATION_STATUSES)[number])}
              disabled={outcome === "No Answer"}
            >
              <SelectTrigger className="w-full h-9">
                <SelectValue placeholder={outcome === "No Answer" ? "No one answered" : "Select response…"} />
              </SelectTrigger>
              <SelectContent>
                {CONFIRMATION_STATUSES.map(status => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status] ?? status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          </div>

          {/*
            No-answer attempts are the most common call result and used to vanish
            from tracking entirely. Now they are recorded as an attempt: the status
            is untouched, but the attempt is counted and shown on the group so
            repeated silence becomes visible.
          */}
          {outcome === "No Answer" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700 px-3 py-2 flex items-start gap-2">
              <Info className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-700 dark:text-slate-200">
                Recorded as a <strong>contact attempt</strong>. The confirmation status stays as it is, and the attempt
                still shows in the group history and in the contact log.
              </p>
            </div>
          )}

          {/* Confirmed - show amount field */}
          {confirmationStatus === "Confirmed" && (
            <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-2.5">
              {openPromise && (
                <div className="rounded border border-amber-300 bg-amber-50 p-2 space-y-1.5">
                  <p className="text-xs font-medium text-amber-900">
                    Open promise exists: {fmtPromiseAmountShort(openPromise.amount)} due{" "}
                    {openPromise.promisedDate ? new Date(openPromise.promisedDate).toLocaleDateString("en-GB") : "—"} ({openPromise.customerName})
                    {(openPromise.rescheduleCount ?? 0) > 0 && (
                      <span className="ml-1.5 inline-flex items-center rounded bg-red-200 px-1.5 py-0.5 font-semibold text-red-900">
                        rescheduled ×{openPromise.rescheduleCount}
                      </span>
                    )}
                  </p>
                  <RadioGroup value={promiseMode} onValueChange={v => setPromiseMode(v as "reschedule" | "new")} className="gap-1">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="reschedule" id="pm-reschedule" />
                      <Label htmlFor="pm-reschedule" className="text-xs font-normal cursor-pointer">
                        Reschedule this promise (customer moved the payment)
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="new" id="pm-new" />
                      <Label htmlFor="pm-new" className="text-xs font-normal cursor-pointer">
                        Create a separate new promise
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Promised amount (EUR) — optional</Label>
                  <Input
                    className="h-9"
                    type="number"
                    value={confirmationAmount}
                    onChange={e => setConfirmationAmount(e.target.value)}
                    placeholder="leave empty if not stated"
                    step="0.01"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Promised payment date</Label>
                  <Input
                    className="h-9"
                    type="date"
                    value={promisedDate}
                    onChange={e => setPromisedDate(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {openPromise && promiseMode === "reschedule"
                  ? "The existing promise is moved to the new date."
                  : "A Promise-to-Pay record is created."}
                {" "}Leave the amount empty when the customer promised to pay without naming a figure — the promise is recorded as “amount not stated”.
              </p>
            </div>
          )}

          {/* Pending Follow-up - show follow-up date and amount */}
          {confirmationStatus === "Pending Follow-up" && (
            <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Expected amount (EUR)</Label>
                  <Input
                    className="h-9"
                    type="number"
                    value={confirmationAmount}
                    onChange={e => setConfirmationAmount(e.target.value)}
                    placeholder="e.g., 50000"
                    step="0.01"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Follow-up date</Label>
                  <Input
                    className="h-9"
                    type="date"
                    value={followUpDate}
                    onChange={e => setFollowUpDate(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                The follow-up date is kept on the group and shows on the Collections Desk when it arrives.
              </p>
            </div>
          )}

          {/* Broken - show action options */}
          {confirmationStatus === "Broken" && (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-2.5">
              <p className="text-xs font-medium text-red-900">Choose next action:</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded border border-red-200 bg-white p-2 text-left text-xs hover:bg-red-50 transition-colors"
                  onClick={() => setConfirmationStatus("Pending Follow-up")}
                >
                  <div className="font-medium text-red-700">→ Pending Follow-up</div>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded border border-red-200 bg-white p-2 text-left text-xs hover:bg-red-50 transition-colors"
                  onClick={() => setConfirmationStatus("Confirmed")}
                >
                  <div className="font-medium text-red-700">→ Reschedule Promise</div>
                </button>

              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">
              {confirmationStatus === "Broken" ? "Reason / notes (optional)" : "Additional notes (optional)"}
            </Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={confirmationStatus === "Broken" ? "Why is the payment not confirmed?" : "What was discussed…"}
              rows={2}
              className="resize-y min-h-[56px]"
            />
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t bg-muted/30 px-5 py-3">
          <Button variant="outline" className="bg-background" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={logCall.isPending || !confirmationStatus}
          >
            {logCall.isPending ? "Saving…" : "Log Call"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
