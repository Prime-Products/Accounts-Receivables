import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Mail, MapPin, Plus, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { fmtEur, fmtDate } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

interface CallManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: {
    name: string;
    overdue: number;
    forecast?: number;
    status?: string;
    daysInProblematic?: number;
    contact?: {
      email?: string;
      phone?: string;
      address?: string;
    };
  };
}

export function CallManagementModal({ open, onOpenChange, group }: CallManagementModalProps) {
  const [activeTab, setActiveTab] = useState("summary");
  const [showAddTask, setShowAddTask] = useState(false);
  const [showPromise, setShowPromise] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);

  // Fetch call history (tasks, notes, promises)
  const { data: callHistory, isLoading: historyLoading } = trpc.calls.getHistory.useQuery(
    { group: group.name },
    { enabled: open }
  );

  const utils = trpc.useUtils();

  // Log call result mutation
  const logCall = trpc.calls.logCall.useMutation({
    onSuccess: () => {
      toast.success("Call logged");
      utils.calls.getHistory.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleLogCall = (outcome: "no_answer" | "promised" | "disputed") => {
    logCall.mutate({ group: group.name, outcome });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{group.name}</span>
              {group.status && (
                <Badge variant={group.status === "Critical" ? "destructive" : "secondary"}>
                  {group.status}
                  {group.daysInProblematic && ` (${group.daysInProblematic}d)`}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="history">Call Log</TabsTrigger>
              <TabsTrigger value="actions">Actions</TabsTrigger>
            </TabsList>

            {/* Summary Tab */}
            <TabsContent value="summary" className="space-y-3">
              {/* Contact Info */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {group.contact?.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a href={`tel:${group.contact.phone}`} className="text-blue-600 hover:underline">
                        {group.contact.phone}
                      </a>
                    </div>
                  )}
                  {group.contact?.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a href={`mailto:${group.contact.email}`} className="text-blue-600 hover:underline">
                        {group.contact.email}
                      </a>
                    </div>
                  )}
                  {group.contact?.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <span>{group.contact.address}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Group Summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Outstanding Balance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Overdue:</span>
                    <span className="font-mono font-bold text-red-600">{fmtEur(group.overdue)}</span>
                  </div>
                  {group.forecast !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expected this month:</span>
                      <span className="font-mono font-bold text-emerald-700">{fmtEur(group.forecast)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Call History Tab */}
            <TabsContent value="history" className="space-y-3">
              {historyLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : callHistory && callHistory.length > 0 ? (
                <div className="space-y-2">
                  {callHistory.map((entry: any, idx: any) => (
                    <Card key={idx} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{fmtDate(entry.date)}</span>
                            <Badge variant="outline" className="text-xs">
                              {entry.type}
                            </Badge>
                            {entry.outcome && (
                              <Badge
                                variant={
                                  entry.outcome === "promised"
                                    ? "default"
                                    : entry.outcome === "no_answer"
                                      ? "secondary"
                                      : "destructive"
                                }
                                className="text-xs"
                              >
                                {entry.outcome === "no_answer"
                                  ? "Δεν απάντησε"
                                  : entry.outcome === "promised"
                                    ? "Υποσχέθηκε"
                                    : "Αμφισβητεί"}
                              </Badge>
                            )}
                          </div>
                          {entry.note && <p className="text-xs text-foreground mt-1">{entry.note}</p>}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">No call history yet</div>
              )}
            </TabsContent>

            {/* Actions Tab */}
            <TabsContent value="actions" className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-medium">Log Call Result</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLogCall("no_answer")}
                    disabled={logCall.isPending}
                  >
                    Δεν απάντησε
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLogCall("promised")}
                    disabled={logCall.isPending}
                  >
                    Υποσχέθηκε
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLogCall("disputed")}
                    disabled={logCall.isPending}
                  >
                    Αμφισβητεί
                  </Button>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <p className="text-sm font-medium">Other Actions</p>
                <div className="space-y-2">
                  <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => setShowAddTask(true)}>
                    <Plus className="h-4 w-4" />
                    Add Task
                  </Button>
                  <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => setShowPromise(true)}>
                    <Plus className="h-4 w-4" />
                    Promise to Pay
                  </Button>
                  <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => setShowAddNote(true)}>
                    <Plus className="h-4 w-4" />
                    Add Note
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Add Task Dialog */}
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task for {group.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Task Description</label>
              <textarea className="w-full border rounded p-2 text-sm mt-1" placeholder="Enter task description" />
            </div>
            <div>
              <label className="text-sm font-medium">Due Date</label>
              <input type="date" className="w-full border rounded p-2 text-sm mt-1" />
            </div>
            <Button className="w-full">Create Task</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Promise to Pay Dialog */}
      <Dialog open={showPromise} onOpenChange={setShowPromise}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promise to Pay - {group.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Amount (€)</label>
              <input type="number" className="w-full border rounded p-2 text-sm mt-1" placeholder="0.00" />
            </div>
            <div>
              <label className="text-sm font-medium">Promised Date</label>
              <input type="date" className="w-full border rounded p-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <textarea className="w-full border rounded p-2 text-sm mt-1" placeholder="Add any notes..." />
            </div>
            <Button className="w-full">Record Promise</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={showAddNote} onOpenChange={setShowAddNote}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note - {group.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Note</label>
              <textarea className="w-full border rounded p-2 text-sm mt-1 h-24" placeholder="Enter note..." />
            </div>
            <Button className="w-full">Add Note</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
