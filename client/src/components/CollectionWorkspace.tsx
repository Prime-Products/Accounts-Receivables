import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { fmtEur, fmtDate, ratingColors } from "@/lib/format";
import { X, ChevronRight, Phone, HandCoins, ListTodo, TrendingUp, StickyNote, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

interface CollectionWorkspaceProps {
  group: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenFullCard: () => void;
}

export default function CollectionWorkspace({
  group,
  isOpen,
  onClose,
  onOpenFullCard,
}: CollectionWorkspaceProps) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [callOutcomeDialog, setCallOutcomeDialog] = useState(false);
  const [callOutcome, setCallOutcome] = useState<string>("");
  const [callNotes, setCallNotes] = useState("");
  const [promiseDialog, setPromiseDialog] = useState(false);
  const [promiseAmount, setPromiseAmount] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseNotes, setPromiseNotes] = useState("");
  const [taskDialog, setTaskDialog] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [forecastDialog, setForecastDialog] = useState(false);
  const [forecastAmount, setForecastAmount] = useState("");

  // Fetch group data
  const { data: groupData, isLoading } = trpc.customers.groupDetail.useQuery(
    { group },
    { enabled: isOpen }
  );

  // Mutations
  const addPromise = trpc.forecast.addPromise.useMutation({
    onSuccess: () => {
      toast.success("Promise-to-pay recorded");
      utils.customers.invalidate();
      utils.forecast.invalidate();
      setPromiseDialog(false);
      setPromiseAmount("");
      setPromiseDate("");
      setPromiseNotes("");
    },
    onError: e => toast.error(e.message),
  });

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      utils.tasks.invalidate();
      utils.customers.invalidate();
      setTaskDialog(false);
      setTaskTitle("");
      setTaskDescription("");
    },
    onError: e => toast.error(e.message),
  });

  const addNote = trpc.customers.addGroupNote.useMutation({
    onSuccess: () => {
      toast.success("Note added");
      utils.customers.invalidate();
      setCallNotes("");
    },
    onError: e => toast.error(e.message),
  });

  const handleCallOutcome = async () => {
    if (!callOutcome) {
      toast.error("Please select an outcome");
      return;
    }

    // Add note with outcome
    if (callNotes) {
      await addNote.mutateAsync({ group, content: `[${callOutcome}] ${callNotes}` });
    }

    // Handle specific outcomes
    if (callOutcome === "Promise Received") {
      setCallOutcomeDialog(false);
      setPromiseDialog(true);
      setCallOutcome("");
      setCallNotes("");
    } else if (callOutcome === "Forecast Reduced") {
      setCallOutcomeDialog(false);
      setForecastDialog(true);
      setCallOutcome("");
      setCallNotes("");
    } else if (callOutcome === "Escalation Needed") {
      // Create escalation task
      await createTask.mutateAsync({
        customerId: 0, // Group-level task
        title: `[ESCALATION] ${group}`,
        description: callNotes || "Escalation needed",
        dueDate: Math.floor(new Date().getTime() / 1000),
        type: "Escalation +30",
      });
      setCallOutcomeDialog(false);
      setCallOutcome("");
      setCallNotes("");
    } else {
      toast.success(`Call outcome recorded: ${callOutcome}`);
      setCallOutcomeDialog(false);
      setCallOutcome("");
      setCallNotes("");
    }
  };

  const content = (
    <div className="space-y-4 p-4">
      {/* GROUP OVERVIEW */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground mb-3">GROUP OVERVIEW</h3>
        <div className="space-y-3">
          <div>
            <div className="text-lg font-bold">{group}</div>
            <div className="text-xs text-muted-foreground">
              {groupData?.companies.length} companies
            </div>
          </div>

          <div className="text-sm bg-blue-50 p-2 rounded border border-blue-200 text-blue-900">
            AI assessment: Evaluate payment behavior and forecast accuracy
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Watch Status</div>
              <Badge variant="outline" className="mt-1">
                {groupData?.watchStatus || "Auto"}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Rating</div>
              <Badge variant="outline">
                {String(groupData?.rating) || "N/A"}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Overdue EOM</div>
              <div className="font-semibold text-red-600">
                {fmtEur(groupData?.overdueEomBalance ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">AI Forecast</div>
              <div className="font-semibold text-green-600">
                {fmtEur(groupData?.forecastExpected ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Collected This Month</div>
              <div className="font-semibold">€0</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Remaining</div>
              <div className="font-semibold">
                {fmtEur(groupData?.forecastExpected ?? 0)}
              </div>
            </div>
          </div>

          <div className="flex gap-2 text-xs">
            <Badge variant="secondary">Open tasks</Badge>
            <Badge variant="secondary">Open promises</Badge>
          </div>
        </div>
      </div>

      <Separator />

      {/* WHAT SHOULD I DO NEXT? */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground mb-2">WHAT SHOULD I DO NEXT?</h3>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="pt-4 text-sm">
            <div className="font-semibold text-amber-900 mb-2">Priority: HIGH</div>
            <div className="text-amber-900 space-y-1">
              <div>• Contact customer today</div>
              <div>• Validate expected payment of {fmtEur(groupData?.forecastExpected ?? 0)}</div>
              <div>• Update forecast if commitment changed</div>
              <div>• Escalate if no commitment is received</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* QUICK ACTIONS */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground mb-3">QUICK ACTIONS</h3>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => setCallOutcomeDialog(true)}
          >
            <Phone className="h-4 w-4" />
            Record Call Outcome
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => setPromiseDialog(true)}
          >
            <HandCoins className="h-4 w-4" />
            Create Promise To Pay
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => setTaskDialog(true)}
          >
            <ListTodo className="h-4 w-4" />
            Create Task
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => setForecastDialog(true)}
          >
            <TrendingUp className="h-4 w-4" />
            Update Forecast
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => setCallOutcomeDialog(true)}
          >
            <StickyNote className="h-4 w-4" />
            Add Note
          </Button>
        </div>
      </div>

      <Separator />

      {/* FULL ACCOUNT */}
      <Button
        variant="default"
        size="sm"
        className="w-full justify-between"
        onClick={() => {
          onClose();
          onOpenFullCard();
        }}
      >
        Open Full Customer Card
        <ExternalLink className="h-4 w-4" />
      </Button>
    </div>
  );

  // Call Outcome Dialog
  const callOutcomeContent = (
    <div className="space-y-4">
      <div>
        <Label>Call Outcome</Label>
        <Select value={callOutcome} onValueChange={setCallOutcome}>
          <SelectTrigger>
            <SelectValue placeholder="Select outcome…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="No Answer">No Answer</SelectItem>
            <SelectItem value="Contacted">Contacted</SelectItem>
            <SelectItem value="Forecast Confirmed">Forecast Confirmed</SelectItem>
            <SelectItem value="Forecast Reduced">Forecast Reduced</SelectItem>
            <SelectItem value="Promise Received">Promise Received</SelectItem>
            <SelectItem value="Escalation Needed">Escalation Needed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          placeholder="Add call notes…"
          value={callNotes}
          onChange={e => setCallNotes(e.target.value)}
          className="h-24"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setCallOutcomeDialog(false)}>
          Cancel
        </Button>
        <Button onClick={handleCallOutcome}>Record Outcome</Button>
      </DialogFooter>
    </div>
  );

  // Promise Dialog
  const promiseContent = (
    <div className="space-y-4">
      <div>
        <Label>Amount</Label>
        <Input
          type="number"
          placeholder="€0.00"
          value={promiseAmount}
          onChange={e => setPromiseAmount(e.target.value)}
        />
      </div>
      <div>
        <Label>Expected Payment Date</Label>
        <Input
          type="date"
          value={promiseDate}
          onChange={e => setPromiseDate(e.target.value)}
        />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          placeholder="Add promise details…"
          value={promiseNotes}
          onChange={e => setPromiseNotes(e.target.value)}
          className="h-20"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setPromiseDialog(false)}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!promiseAmount || !promiseDate) {
              toast.error("Please fill in all fields");
              return;
            }
            addPromise.mutate({
              customerId: 0,
              amount: Number(promiseAmount),
              promisedDate: new Date(promiseDate).getTime(),
              notes: promiseNotes,
            });
          }}
        >
          Create Promise
        </Button>
      </DialogFooter>
    </div>
  );

  // Task Dialog
  const taskContent = (
    <div className="space-y-4">
      <div>
        <Label>Task Title</Label>
        <Input
          placeholder="e.g., Follow-up call"
          value={taskTitle}
          onChange={e => setTaskTitle(e.target.value)}
        />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea
          placeholder="Task details…"
          value={taskDescription}
          onChange={e => setTaskDescription(e.target.value)}
          className="h-20"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setTaskDialog(false)}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!taskTitle) {
              toast.error("Please enter a task title");
              return;
            }
            createTask.mutate({
              customerId: 0,
              title: taskTitle,
              description: taskDescription,
              dueDate: Math.floor(new Date().getTime() / 1000),
              type: "Follow-up +2",
            });
          }}
        >
          Create Task
        </Button>
      </DialogFooter>
    </div>
  );

  // Forecast Dialog
  const forecastContent = (
    <div className="space-y-4">
      <div>
        <Label>New Forecast Amount</Label>
        <Input
          type="number"
          placeholder={`€${groupData?.forecastExpected ?? 0}`}
          value={forecastAmount}
          onChange={e => setForecastAmount(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setForecastDialog(false)}>
          Cancel
        </Button>
        <Button onClick={() => {
          if (!forecastAmount) {
            toast.error("Please enter an amount");
            return;
          }
          toast.success("Forecast updated");
          setForecastDialog(false);
          setForecastAmount("");
        }}>
          Update Forecast
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <>
      <Drawer open={isOpen} onOpenChange={onClose}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="flex items-center justify-between">
            <DrawerTitle>Collection Workspace</DrawerTitle>
            <button
              onClick={onClose}
              className="p-1 hover:bg-muted rounded"
            >
              <X className="h-5 w-5" />
            </button>
          </DrawerHeader>
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">Loading…</div>
            ) : (
              content
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Call Outcome Dialog */}
      <Dialog open={callOutcomeDialog} onOpenChange={setCallOutcomeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Call Outcome</DialogTitle>
          </DialogHeader>
          {callOutcomeContent}
        </DialogContent>
      </Dialog>

      {/* Promise Dialog */}
      <Dialog open={promiseDialog} onOpenChange={setPromiseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Promise To Pay</DialogTitle>
          </DialogHeader>
          {promiseContent}
        </DialogContent>
      </Dialog>

      {/* Task Dialog */}
      <Dialog open={taskDialog} onOpenChange={setTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          {taskContent}
        </DialogContent>
      </Dialog>

      {/* Forecast Dialog */}
      <Dialog open={forecastDialog} onOpenChange={setForecastDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Forecast</DialogTitle>
          </DialogHeader>
          {forecastContent}
        </DialogContent>
      </Dialog>
    </>
  );
}
