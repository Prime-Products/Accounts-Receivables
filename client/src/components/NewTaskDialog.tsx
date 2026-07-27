import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TeamMemberSelect } from "@/components/TeamMemberSelect";
import { trpc } from "@/lib/trpc";
import { ChevronsUpDown, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

export const TASK_TYPES = ["Follow-up +2", "Follow-up +15", "Follow-up +20 SOA", "Escalation +30", "Contract Expiry", "Manual"] as const;

/**
 * Reusable customer-level task creation dialog.
 * - `defaultCustomerId`: preselect a customer (e.g. from Customer 360).
 * - `customerIds`: restrict the pickable customers (e.g. member companies of a group).
 * - `hideCustomerPicker`: hide the customer selector entirely (e.g. group card — task is recorded against the group's primary member).
 * - `trigger`: custom trigger element; defaults to a "New Task" button.
 */
export default function NewTaskDialog({
  defaultCustomerId,
  customerIds,
  hideCustomerPicker,
  trigger,
  open: externalOpen,
  onOpenChange,
}: {
  defaultCustomerId?: number;
  customerIds?: number[];
  hideCustomerPicker?: boolean;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (newOpen: boolean) => {
    if (externalOpen !== undefined) {
      onOpenChange?.(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  };
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(defaultCustomerId ?? null);
  const [type, setType] = useState<string>("Manual");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assigneeId, setAssigneeId] = useState<number | null>(null);

  const { data: allCustomers } = trpc.customers.list.useQuery(undefined, { enabled: open });
  const customers = customerIds ? (allCustomers ?? []).filter(c => customerIds.includes(c.id)) : (allCustomers ?? []);
  const selected = customers.find(c => c.id === customerId) ?? (allCustomers ?? []).find(c => c.id === customerId);

  const create = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      utils.tasks.invalidate();
      utils.forecast.dashboard.invalidate();
      utils.customers.invalidate();
      setOpen(false);
      setCustomerId(defaultCustomerId ?? null);
      setTitle("");
      setDescription("");
      setType("Manual");
      setAssigneeId(null);
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    if (!customerId) return toast.error("Select a customer");
    if (!title.trim()) return toast.error("Enter a task title");
    if (!dueDate) return toast.error("Select a due date");
    create.mutate({
      customerId,
      type: type as (typeof TASK_TYPES)[number],
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: new Date(`${dueDate}T12:00:00`).getTime(),
      assigneeId: assigneeId ?? undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (o) setCustomerId(defaultCustomerId ?? null);
      }}
    >
      {externalOpen === undefined && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New Task
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className={hideCustomerPicker ? "hidden" : "space-y-1.5"}>
            <Label>Customer</Label>
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  <span className="truncate">{selected ? selected.name : "Select customer…"}</span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search customer…" />
                  <CommandList>
                    <CommandEmpty>No customer found.</CommandEmpty>
                    <CommandGroup>
                      {customers.map(c => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={() => {
                            setCustomerId(c.id);
                            setCustomerOpen(false);
                          }}
                        >
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map(t => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Assignee (optional)</Label>
            <TeamMemberSelect value={assigneeId} onChange={setAssigneeId} />
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Call customer about overdue balance" />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Details, notes, agreed actions…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
