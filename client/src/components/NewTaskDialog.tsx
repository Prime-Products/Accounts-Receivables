import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
 * Reusable group-level task creation dialog. Tasks are always attached to a
 * GROUP (or to invoices) — never to an individual customer directly. The
 * selected group's primary member company is used as the storage anchor.
 * - `defaultCustomerId`: preselect via a customer id (its group is used).
 * - `customerIds`: restrict to specific customers (their groups are used).
 * - `hideCustomerPicker`: hide the group selector entirely (e.g. group card — the group is already known).
 * - `trigger`: custom trigger element; defaults to a "New Task" button.
 * - `attachInvoices`: invoices pre-attached to the task (send-invoices-to-colleague flow).
 */
export default function NewTaskDialog({
  defaultCustomerId,
  customerIds,
  hideCustomerPicker,
  trigger,
  open: externalOpen,
  onOpenChange,
  attachInvoices,
  defaultTitle,
  defaultDescription,
}: {
  defaultCustomerId?: number;
  customerIds?: number[];
  hideCustomerPicker?: boolean;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  attachInvoices?: { id: number; invoiceNumber: string; amount: number | string; currency?: string | null }[];
  defaultTitle?: string;
  defaultDescription?: string;
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
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState(defaultDescription ?? "");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assigneeId, setAssigneeId] = useState<number | null>(null);

  const { data: allCustomers } = trpc.customers.list.useQuery(undefined, { enabled: open });
  const customers = customerIds ? (allCustomers ?? []).filter(c => customerIds.includes(c.id)) : (allCustomers ?? []);
  const groupKeyOf = (c: { customerGroup?: string | null; name: string }) =>
    (c.customerGroup ?? "").trim() || c.name;
  /** One entry per group: group name → representative (primary) customer id. */
  const groups = (() => {
    const map = new Map<string, number>();
    for (const c of customers) {
      const key = groupKeyOf(c);
      if (!map.has(key)) map.set(key, c.id);
    }
    return Array.from(map.entries())
      .map(([name, primaryCustomerId]) => ({ name, primaryCustomerId }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();
  const selectedCustomer = (allCustomers ?? []).find(c => c.id === customerId);
  const selectedGroupName = selectedCustomer ? groupKeyOf(selectedCustomer) : null;

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
    if (!customerId) return toast.error("Select a group");
    if (!title.trim()) return toast.error("Enter a task title");
    if (!dueDate) return toast.error("Select a due date");
    create.mutate({
      customerId,
      type: type as (typeof TASK_TYPES)[number],
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: new Date(`${dueDate}T12:00:00`).getTime(),
      assigneeId: assigneeId ?? undefined,
      invoiceIds: attachInvoices && attachInvoices.length > 0 ? attachInvoices.map(i => i.id) : undefined,
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
      <ResizableDialogContent storageKey="new-task" className="sm:max-w-none w-[32rem] max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className={hideCustomerPicker ? "hidden" : "space-y-1.5"}>
            <Label>Group</Label>
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  <span className="truncate">{selectedGroupName ?? "Select group…"}</span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search group…" />
                  <CommandList>
                    <CommandEmpty>No group found.</CommandEmpty>
                    <CommandGroup>
                      {groups.map(g => (
                        <CommandItem
                          key={g.name}
                          value={g.name}
                          onSelect={() => {
                            setCustomerId(g.primaryCustomerId);
                            setCustomerOpen(false);
                          }}
                        >
                          {g.name}
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
            <Label>Assigned to (optional)</Label>
            <TeamMemberSelect value={assigneeId} onChange={setAssigneeId} />
          </div>
          {attachInvoices && attachInvoices.length > 0 && (
            <div className="space-y-1.5">
              <Label>Attached invoices ({attachInvoices.length})</Label>
              <div className="rounded-md border bg-muted/40 p-2 max-h-32 overflow-y-auto space-y-1">
                {attachInvoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between text-xs">
                    <span className="font-mono">{inv.invoiceNumber}</span>
                    <span className="font-mono text-muted-foreground">
                      {inv.currency && inv.currency !== "EUR" ? `${inv.currency} ` : "€"}
                      {Number(inv.amount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">These invoices will be linked to the task so your colleague sees exactly what to look at.</p>
            </div>
          )}
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
      </ResizableDialogContent>
    </Dialog>
  );
}
