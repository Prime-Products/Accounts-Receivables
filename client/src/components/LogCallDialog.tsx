import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { trpc } from "@/lib/trpc";
import { Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const OUTCOMES = ["Reached", "No Answer", "Voicemail", "Promised Payment", "Dispute", "Other"] as const;
const CONFIRMATION_STATUSES = ["Not Contacted", "Confirmed", "Pending Follow-up", "Broken"] as const;

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
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]>("Reached");
  const [notes, setNotes] = useState("");
  const [confirmationStatus, setConfirmationStatus] = useState<(typeof CONFIRMATION_STATUSES)[number] | "">("");
  const [confirmationAmount, setConfirmationAmount] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [promiseMode, setPromiseMode] = useState<"reschedule" | "new">("reschedule");
  const utils = trpc.useUtils();

  // Existing open promise for this group (offered for rescheduling on Confirmed)
  const { data: openPromise } = trpc.calls.getOpenPromise.useQuery({ group }, { enabled: open });

  useEffect(() => {
    if (open) {
      setCustomerId(defaultCustomerId ?? null);
      setContactName("");
      setOutcome("Reached");
      setNotes("");
      setConfirmationStatus("");
      setConfirmationAmount("");
      setFollowUpDate("");
      setPromisedDate("");
      setPromiseMode("reschedule");
    }
  }, [open, defaultCustomerId]);

    const logCall = trpc.calls.logCall.useMutation({
    onSuccess: () => {
      toast.success("Call logged");
      utils.customers.invalidate();
      utils.calls.invalidate();
      utils.tasks.invalidate();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!confirmationStatus) {
      toast.error("Please select a confirmation status");
      return;
    }
    if (confirmationStatus === "Confirmed") {
      if (!confirmationAmount || Number(confirmationAmount) <= 0) {
        toast.error("Please enter the confirmed amount");
        return;
      }
      if (!promisedDate) {
        toast.error("Please select the promised payment date");
        return;
      }
    }

    const payload: any = {
      group,
      customerId: customerId ?? undefined,
      contactName: contactName.trim() || undefined,
      outcome,
      notes: notes.trim() || undefined,
      confirmationStatus: confirmationStatus as (typeof CONFIRMATION_STATUSES)[number],
    };

    // Add optional confirmation details
    if (confirmationAmount) {
      payload.confirmationAmount = Number(confirmationAmount);
    }
    if (followUpDate) {
      payload.followUpDate = new Date(followUpDate).getTime();
    }
    if (confirmationStatus === "Confirmed" && promisedDate) {
      payload.promisedDate = new Date(promisedDate).getTime();
    }
    // Reschedule the existing open promise instead of creating a duplicate
    if (confirmationStatus === "Confirmed" && openPromise && promiseMode === "reschedule") {
      payload.reschedulePromiseId = openPromise.id;
    }

    logCall.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4" /> Log Call — {group}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {companies && companies.length > 1 && (
            <div className="space-y-1.5">
              <Label>Company (optional)</Label>
              <Select
                value={customerId ? String(customerId) : undefined}
                onValueChange={v => setCustomerId(Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Whole group" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Contact person (optional)</Label>
            <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Who did you speak with?" />
          </div>
          <div className="space-y-1.5">
            <Label>Outcome</Label>
            <Select value={outcome} onValueChange={v => setOutcome(v as (typeof OUTCOMES)[number])}>
              <SelectTrigger className="w-full">
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

          {/* Confirmation Status Section */}
          <div className="border-t pt-3 mt-3">
            <Label className="text-sm font-semibold">Customer Response *</Label>
            <Select value={confirmationStatus} onValueChange={(v) => setConfirmationStatus(v as (typeof CONFIRMATION_STATUSES)[number])}>
              <SelectTrigger className="w-full mt-1.5">
                <SelectValue placeholder="Select response…" />
              </SelectTrigger>
              <SelectContent>
                {CONFIRMATION_STATUSES.map(status => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Confirmed - show amount field */}
          {confirmationStatus === "Confirmed" && (
            <div className="space-y-1.5 bg-green-50 p-2 rounded">
              {openPromise && (
                <div className="rounded border border-amber-300 bg-amber-50 p-2 space-y-2">
                  <p className="text-xs font-medium text-amber-900">
                    Open promise exists: €{Number(openPromise.amount).toLocaleString()} due{" "}
                    {new Date(openPromise.promisedDate).toLocaleDateString("en-GB")} ({openPromise.customerName})
                  </p>
                  <RadioGroup value={promiseMode} onValueChange={v => setPromiseMode(v as "reschedule" | "new")} className="gap-1.5">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="reschedule" id="pm-reschedule" />
                      <Label htmlFor="pm-reschedule" className="text-xs font-normal cursor-pointer">
                        Reschedule this promise to the new date/amount (customer moved the payment)
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="new" id="pm-new" />
                      <Label htmlFor="pm-new" className="text-xs font-normal cursor-pointer">
                        Create a separate new promise (additional payment)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
              <Label>Confirmed amount (EUR)</Label>
              <Input
                type="number"
                value={confirmationAmount}
                onChange={e => setConfirmationAmount(e.target.value)}
                placeholder="e.g., 50000"
                step="0.01"
              />
              <Label className="mt-2">Promised payment date</Label>
              <Input
                type="date"
                value={promisedDate}
                onChange={e => setPromisedDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {openPromise && promiseMode === "reschedule"
                  ? "The existing promise and its follow-up task will be moved to the new date."
                  : "A Promise-to-Pay record will be created automatically."}
              </p>
            </div>
          )}

          {/* Pending Follow-up - show follow-up date and amount */}
          {confirmationStatus === "Pending Follow-up" && (
            <div className="space-y-1.5 bg-blue-50 p-2 rounded">
              <Label>Expected amount (EUR)</Label>
              <Input
                type="number"
                value={confirmationAmount}
                onChange={e => setConfirmationAmount(e.target.value)}
                placeholder="e.g., 50000"
                step="0.01"
              />
              <Label className="mt-2">Follow-up date</Label>
              <Input
                type="date"
                value={followUpDate}
                onChange={e => setFollowUpDate(e.target.value)}
              />
            </div>
          )}

          {/* Broken - show notes field */}
          {confirmationStatus === "Broken" && (
            <div className="space-y-1.5 bg-red-50 p-2 rounded">
              <Label>Reason (optional)</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Why can't they pay?"
                rows={2}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Additional notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What was discussed…" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
