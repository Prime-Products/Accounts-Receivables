import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate, fmtEur, onHoldStatusColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Gavel, PauseCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const FLOW = ["Under Review", "Eligible for On Hold", "On Hold", "Legal"] as const;
type OnHoldStatus = "Under Review" | "Eligible for On Hold" | "On Hold" | "Legal" | "Rejected" | "Resolved";

export default function OnHold() {
  const { data: proposals, isLoading } = trpc.onHold.list.useQuery();
  const { data: myRole } = trpc.admin.myRole.useQuery();
  const utils = trpc.useUtils();
  const [decision, setDecision] = useState<{ id: number; to: OnHoldStatus } | null>(null);
  const [notes, setNotes] = useState("");

  const decide = trpc.onHold.transition.useMutation({
    onSuccess: () => {
      toast.success("Decision recorded");
      utils.onHold.invalidate();
      utils.customers.invalidate();
      utils.forecast.dashboard.invalidate();
      setDecision(null);
      setNotes("");
    },
    onError: e => toast.error(e.message),
  });

  const canDecide = myRole?.appRole === "Administrator" || myRole?.appRole === "Management";

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <PauseCircle className="h-6 w-6" /> On-Hold Workflow
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Digital approval flow: Under Review → Eligible for On Hold → On Hold → Legal. Proposals are submitted from the
          Customer 360 View with supporting data aggregated automatically.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FLOW.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <Badge variant="outline" className={onHoldStatusColors[s] ?? ""}>
              {s}
            </Badge>
            {i < FLOW.length - 1 && <span className="text-muted-foreground">→</span>}
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (proposals ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No On-Hold proposals. Submit one from a customer's 360 view when overdue thresholds are breached.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(proposals ?? []).map(p => {
            let supporting: { invoiceNumber: string; dueDate: string; outstanding: string; daysOverdue: number }[] = [];
            try {
              supporting = p.supportingData ? JSON.parse(p.supportingData) : [];
            } catch {
              supporting = [];
            }
            return (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      {p.customerName}
                      <Badge variant="secondary">{p.customerTier}</Badge>
                      <Badge variant="outline" className={onHoldStatusColors[p.status] ?? ""}>
                        {p.status}
                      </Badge>
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">Submitted {fmtDate(p.createdAt.getTime())}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">
                    <span className="font-medium">Reason:</span> {p.reason}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-sm bg-muted/50 rounded-md p-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Total Overdue</div>
                      <div className="font-mono font-semibold text-red-600">{fmtEur(Number(p.totalOverdue))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Overdue Invoices</div>
                      <div className="font-semibold">{p.overdueInvoiceCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Oldest Overdue (days)</div>
                      <div className="font-semibold">{p.oldestOverdueDays}</div>
                    </div>
                  </div>
                  {supporting.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Supporting invoices:</span>{" "}
                      {supporting.map(s => `${s.invoiceNumber} (€${s.outstanding}, ${s.daysOverdue}d)`).join(" · ")}
                    </div>
                  )}
                  {p.decisionNotes && (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Decision notes:</span> {p.decisionNotes}
                    </p>
                  )}
                  {canDecide && (p.status === "Under Review" || p.status === "Eligible for On Hold" || p.status === "On Hold") && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {p.status === "Under Review" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setDecision({ id: p.id, to: "Eligible for On Hold" })}>
                            Mark Eligible for On Hold
                          </Button>
                          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setDecision({ id: p.id, to: "Rejected" })}>
                            Reject
                          </Button>
                        </>
                      )}
                      {p.status === "Eligible for On Hold" && (
                        <>
                          <Button size="sm" variant="destructive" onClick={() => setDecision({ id: p.id, to: "On Hold" })}>
                            Approve On Hold
                          </Button>
                          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setDecision({ id: p.id, to: "Rejected" })}>
                            Reject
                          </Button>
                        </>
                      )}
                      {p.status === "On Hold" && (
                        <>
                          <Button size="sm" variant="destructive" className="gap-1" onClick={() => setDecision({ id: p.id, to: "Legal" })}>
                            <Gavel className="h-4 w-4" /> Escalate to Legal
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDecision({ id: p.id, to: "Resolved" })}>
                            Mark Resolved
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  {!canDecide && (p.status === "Under Review" || p.status === "Eligible for On Hold") && (
                    <p className="text-xs text-muted-foreground">Only Management or Administrator can decide on proposals.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={decision !== null} onOpenChange={o => !o && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm: {decision?.to}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Decision notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button
              variant={decision?.to === "Rejected" ? "secondary" : "destructive"}
              disabled={decide.isPending}
              onClick={() => decision && decide.mutate({ id: decision.id, to: decision.to, notes: notes || undefined })}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
