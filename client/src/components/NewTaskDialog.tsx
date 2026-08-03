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
import { matchesAllTokens } from "@shared/textMatch";
import { ChevronsUpDown, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

export const TASK_TYPES = ["Follow-up +2", "Follow-up +15", "Follow-up +20 SOA", "Escalation +30", "Contract Expiry", "Manual", "Help"] as const;

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
  defaultType,
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
  /** Preselected task type — e.g. "Help" when asking a colleague for help. */
  defaultType?: (typeof TASK_TYPES)[number];
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
  const [type, setType] = useState<string>(defaultType ?? "Manual");
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState(defaultDescription ?? "");
  // A help request is rarely answered the same day, so it defaults to +3 days;
  // ordinary tasks keep today's date.
  const [dueDate, setDueDate] = useState(() =>
    new Date(Date.now() + (defaultType === "Help" ? 3 * 86400000 : 0)).toISOString().slice(0, 10)
  );
  /**
   * Every task has an owner: no work item is ever left hanging without a name on
   * it. The field is pre-filled with the logged-in user (see the effect below) and
   * can be changed to a colleague, but it cannot be emptied.
   */
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const isHelp = defaultType === "Help";

  // A help request is always raised by the logged-in user: we name them in the
  // dialog and exclude them from the colleague list.
  const { data: me } = trpc.team.me.useQuery(undefined, { enabled: open });
  const myMemberId = me?.memberId ?? null;
  const myName = me?.name ?? "you";

  /**
   * Default owner = me. For a help request the point is to hand it to someone
   * else, so that one starts empty and is validated on submit instead.
   */
  useEffect(() => {
    if (!open || isHelp) return;
    if (assigneeId == null && myMemberId != null) setAssigneeId(myMemberId);
  }, [open, isHelp, assigneeId, myMemberId]);

  const { data: allCustomers } = trpc.customers.options.useQuery(undefined, { enabled: open });
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

  /**
   * Group search is filtered here, not by cmdk: with hundreds of groups cmdk only
   * scores the rows it has mounted, so typing a name further down the alphabet
   * returned "No group found". Same matcher as the rest of the app (accents,
   * Greek/Latin, any word order), capped so the popover stays responsive.
   */
  const [groupQuery, setGroupQuery] = useState("");
  const visibleGroups = useMemo(() => {
    const q = groupQuery.trim();
    const hits = q ? groups.filter(g => matchesAllTokens(q, [g.name])) : groups;
    return { rows: hits.slice(0, 60), hidden: Math.max(0, hits.length - 60) };
  }, [groups, groupQuery]);

  const create = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success(isHelp ? "Help request sent" : "Task created");
      utils.tasks.invalidate();
      utils.forecast.dashboard.invalidate();
      utils.customers.invalidate();
      setOpen(false);
      setCustomerId(defaultCustomerId ?? null);
      setTitle("");
      setDescription("");
      setType(defaultType ?? "Manual");
      setAssigneeId(isHelp ? null : myMemberId);
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    if (!customerId) return toast.error("Select a group");
    if (!title.trim()) return toast.error(isHelp ? "Describe what you need" : "Enter a task title");
    if (!dueDate) return toast.error("Select a due date");
    // Mandatory owner: for a normal task we fall back to the current user, for a
    // help request the colleague must be chosen explicitly.
    const owner = assigneeId ?? (isHelp ? null : myMemberId);
    if (owner == null) {
      return toast.error(isHelp ? "Pick the colleague you are asking" : "Assign the task to someone");
    }
    create.mutate({
      customerId,
      type: type as (typeof TASK_TYPES)[number],
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: new Date(`${dueDate}T12:00:00`).getTime(),
      assigneeId: owner,
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
          <DialogTitle>{isHelp ? "Ask a colleague for help" : "New Task"}</DialogTitle>
          {isHelp && (
            <p className="text-xs text-muted-foreground">
              This creates a Help task for your colleague and records the request in the customer's activity log.
            </p>
          )}
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
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Search group…" value={groupQuery} onValueChange={setGroupQuery} />
                  <CommandList className="max-h-72">
                    <CommandEmpty>No group found.</CommandEmpty>
                    <CommandGroup>
                      {visibleGroups.rows.map(g => (
                        <CommandItem
                          key={g.name}
                          value={g.name}
                          onSelect={() => {
                            setCustomerId(g.primaryCustomerId);
                            setCustomerOpen(false);
                            setGroupQuery("");
                          }}
                        >
                          {g.name}
                        </CommandItem>
                      ))}
                      {visibleGroups.hidden > 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          +{visibleGroups.hidden} more — keep typing to narrow down
                        </div>
                      )}
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
              <Label>{isHelp ? "Answer needed by" : "Due date"}</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>
              {isHelp ? "Ask a colleague" : "Assigned to"} <span className="text-destructive">*</span>
            </Label>
            <TeamMemberSelect
              value={assigneeId}
              // The field cannot be cleared: clearing falls back to me (or, for a
              // help request, leaves it empty so the validation asks for a name).
              onChange={id => setAssigneeId(id ?? (isHelp ? null : myMemberId))}
              // Asking yourself for help is not a thing: your own record is out.
              excludeIds={isHelp && myMemberId != null ? [myMemberId] : undefined}
              emptyLabel={isHelp ? "— Search a colleague… —" : "— Search a colleague… —"}
            />
            {isHelp ? (
              <p className="text-[11px] text-muted-foreground">
                Requested by <span className="font-medium text-foreground">{myName}</span>
                {assigneeId == null
                  ? " — pick the colleague you need an answer from."
                  : " — you stay a watcher, so you see the answer."}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {assigneeId != null && assigneeId === myMemberId
                  ? <>Assigned to <span className="font-medium text-foreground">{myName}</span> — pick a colleague to hand it over.</>
                  : "Every task has an owner; pick yourself to keep it on your own list."}
              </p>
            )}
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
            <Label>{isHelp ? "What do you need?" : "Title"}</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={isHelp ? "e.g. Was the delivery completed?" : "e.g. Call customer about overdue balance"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{isHelp ? "Details (optional)" : "Description (optional)"}</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder={isHelp ? "What the customer claims, what you already checked…" : "Details, notes, agreed actions…"}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? (isHelp ? "Sending…" : "Creating…") : isHelp ? "Send request" : "Create Task"}
          </Button>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
}
