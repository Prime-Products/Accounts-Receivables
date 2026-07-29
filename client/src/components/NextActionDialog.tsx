import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { CalendarClock, HandCoins, ShieldAlert, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * "Next action" dialog shown after a promise is marked Not Confirmed (Broken).
 * The customer did not pay — the user must choose what happens next:
 *  1. Schedule a follow-up call (Pending Follow-up + task)
 *  2. Record a new promise to pay (Promise to Pay)
 *  3. Escalate the group's account status (Problematic / Under Review / On Hold / Legal)
 */
export default function NextActionDialog({
  group,
  open,
  onOpenChange,
}: {
  group: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"menu" | "followup" | "promise" | "escalate">("menu");
  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const [followUpDate, setFollowUpDate] = useState(tomorrow());
  const [promiseDate, setPromiseDate] = useState(tomorrow());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [watchStatus, setWatchStatus] = useState<"Problematic" | "Under Review" | "On Hold" | "Legal">("Problematic");

  const invalidate = () => {
    utils.customers.groups.invalidate();
    utils.customers.groupDetail.invalidate();
    utils.tasks.list.invalidate();
    utils.calls.getConfirmationStatus.invalidate();
  };
  const close = () => {
    onOpenChange(false);
    setMode("menu");
    setNotes("");
    setAmount("");
  };
  const updateStatus = trpc.calls.updateConfirmationStatus.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(mode === "followup" ? "Follow-up call scheduled" : "New promise to pay recorded");
      close();
    },
    onError: e => toast.error(e.message),
  });
  const setWatch = trpc.customers.setWatchStatus.useMutation({
    onSuccess: () => {
      invalidate();
      utils.customers.list.invalidate();
      toast.success(`Account status changed to ${watchStatus}`);
      close();
    },
    onError: e => toast.error(e.message),
  });
  const busy = updateStatus.isPending || setWatch.isPending;

  return (
    <Dialog open={open} onOpenChange={v => (v ? onOpenChange(v) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Next action — {group}</DialogTitle>
          <DialogDescription>
            The promise was not kept. Choose the next step so this customer is not left without follow-up.
          </DialogDescription>
        </DialogHeader>

        {mode === "menu" && (
          <div className="grid gap-2 py-1">
            <button
              type="button"
              className="flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-blue-50 hover:border-blue-300 transition-colors"
              onClick={() => setMode("followup")}
            >
              <CalendarClock className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-sm">Schedule a follow-up call</div>
                <div className="text-xs text-muted-foreground">Pick a date — a follow-up task is created and the badge becomes “Pending Follow-up”.</div>
              </div>
            </button>
            <button
              type="button"
              className="flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
              onClick={() => setMode("promise")}
            >
              <HandCoins className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-sm">Record a new promise to pay</div>
                <div className="text-xs text-muted-foreground">New amount and date — the badge becomes “Promise to Pay”. The broken promise stays on record.</div>
              </div>
            </button>
            <button
              type="button"
              className="flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-red-50 hover:border-red-300 transition-colors"
              onClick={() => setMode("escalate")}
            >
              <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-sm">Escalate the account</div>
                <div className="text-xs text-muted-foreground">Change the group status to Problematic, Under Review, On Hold or Legal.</div>
              </div>
            </button>
            <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={close}>
              Decide later
            </Button>
          </div>
        )}

        {mode === "followup" && (
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="na-fu-date">Follow-up date</Label>
              <Input id="na-fu-date" type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="na-fu-notes">Notes (optional)</Label>
              <Textarea id="na-fu-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. promised to review with accounting" />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setMode("menu")}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button
                size="sm"
                disabled={busy || !followUpDate}
                onClick={() =>
                  updateStatus.mutate({
                    group,
                    status: "Pending Follow-up",
                    followUpDate: new Date(`${followUpDate}T12:00:00`).getTime(),
                    notes: notes || undefined,
                  })
                }
              >
                Schedule follow-up
              </Button>
            </div>
          </div>
        )}

        {mode === "promise" && (
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="na-pr-amount">Promised amount (EUR)</Label>
              <Input id="na-pr-amount" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="na-pr-date">Promised date</Label>
              <Input id="na-pr-date" type="date" value={promiseDate} onChange={e => setPromiseDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="na-pr-notes">Notes (optional)</Label>
              <Textarea id="na-pr-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setMode("menu")}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button
                size="sm"
                disabled={busy || !promiseDate || !amount || Number(amount) <= 0}
                onClick={() =>
                  updateStatus.mutate({
                    group,
                    status: "Confirmed",
                    amount: Number(amount),
                    followUpDate: new Date(`${promiseDate}T12:00:00`).getTime(),
                    notes: notes || undefined,
                  })
                }
              >
                Record promise
              </Button>
            </div>
          </div>
        )}

        {mode === "escalate" && (
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label>New account status</Label>
              <Select value={watchStatus} onValueChange={v => setWatchStatus(v as typeof watchStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Problematic">Problematic</SelectItem>
                  <SelectItem value="Under Review">Under Review</SelectItem>
                  <SelectItem value="On Hold">On Hold</SelectItem>
                  <SelectItem value="Legal">Legal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setMode("menu")}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => setWatch.mutate({ group, status: watchStatus })}>
                Escalate
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
