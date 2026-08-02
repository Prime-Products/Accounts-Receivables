import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TeamMemberSelect } from "@/components/TeamMemberSelect";
import { trpc } from "@/lib/trpc";
import { HelpCircle } from "lucide-react";
import { toast } from "sonner";

/** Optional desk label, only used to filter the Questions inbox. */
const DEPARTMENTS = ["Contracts", "Logistics", "Operations", "Finance", "Legal", "Sales", "Other"] as const;

/**
 * Ask one colleague a question about a customer.
 *
 * Intentionally minimal: a question is not scheduled work, so there is no due
 * date and no task type to pick — only who should answer and what you want to
 * know. The question and its answer are recorded on the customer's timeline.
 */
export default function AskColleagueDialog({
  group,
  companies = [],
  defaultCustomerId,
  invoiceIds,
  open,
  onOpenChange,
}: {
  group: string;
  companies?: { id: number; name: string }[];
  defaultCustomerId?: number;
  /** Invoices to attach, when the question comes from an invoice selection. */
  invoiceIds?: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [askedTo, setAskedTo] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [department, setDepartment] = useState<string>("none");
  const [customerId, setCustomerId] = useState<number | null>(defaultCustomerId ?? null);

  const ask = trpc.questions.ask.useMutation({
    onSuccess: () => {
      toast.success("Question sent — you will see the answer here and on the customer timeline");
      setQuestion("");
      setAskedTo(null);
      setDepartment("none");
      onOpenChange(false);
      utils.questions.list.invalidate();
      utils.questions.badges.invalidate();
      utils.customers.groupDetail.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const canSend = askedTo != null && question.trim().length > 0 && !ask.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-amber-600" /> Ask a colleague
          </DialogTitle>
          <DialogDescription>
            About <span className="font-medium text-foreground">{group}</span>. No due date — the question stays open
            until it is answered.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Ask</Label>
            <TeamMemberSelect value={askedTo} onChange={setAskedTo} placeholder="Pick a colleague…" />
          </div>

          {companies.length > 1 && (
            <div className="space-y-1.5">
              <Label>About which company (optional)</Label>
              <Select
                value={customerId ? String(customerId) : "all"}
                onValueChange={v => setCustomerId(v === "all" ? null : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Whole group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Whole group</SelectItem>
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
            <Label>Question</Label>
            <Textarea
              autoFocus
              rows={4}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="e.g. The customer says the order was never delivered — can you check?"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Topic (optional)</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger>
                <SelectValue placeholder="No topic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No topic</SelectItem>
                {DEPARTMENTS.map(d => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {invoiceIds && invoiceIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {invoiceIds.length} invoice(s) will be attached so your colleague sees exactly what you mean.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSend}
            onClick={() =>
              ask.mutate({
                group,
                customerId: customerId ?? undefined,
                askedTo: askedTo!,
                question: question.trim(),
                department: department === "none" ? undefined : (department as any),
                invoiceIds: invoiceIds && invoiceIds.length > 0 ? invoiceIds : undefined,
              })
            }
          >
            {ask.isPending ? "Sending…" : "Send question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
