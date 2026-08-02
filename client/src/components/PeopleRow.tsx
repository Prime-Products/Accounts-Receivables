/**
 * PeopleRow — "who is on this account" for the group / company receivables card.
 *
 * The card used to show two loose badges with the manager and the collector. That
 * read as filter chips rather than people, so this row borrows the Team list's
 * visual language instead: a colored initial avatar, the name, and the job title
 * underneath. Clicking a person re-assigns them; the Watchers block on the right
 * holds colleagues who only need visibility (sales, accounting, management)
 * without owning the collection.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TeamMemberSelect } from "@/components/TeamMemberSelect";
import { watcherColor, watcherInitials } from "@/components/WatcherStack";
import { Eye, Plus, X, UserRound, HandCoins } from "lucide-react";
import { toast } from "sonner";

export interface PersonInfo {
  id: number;
  name: string;
  title?: string | null;
}
export interface WatcherRow {
  memberId: number;
  name: string;
  title?: string | null;
}

/** One clickable person slot: avatar + name + title, or a dashed "assign" state. */
function PersonSlot({
  person,
  role,
  customerId,
  groupName,
  onChanged,
}: {
  person: PersonInfo | null;
  role: "manager" | "collector";
  customerId?: number;
  groupName?: string;
  onChanged?: () => void;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const isCollector = role === "collector";
  const roleName = isCollector ? "Collector" : "Account Manager";
  const subtitle = (person?.title ?? "").trim() || roleName;

  const setManager = trpc.customers.setAccountManager.useMutation({
    onSuccess: res => {
      toast.success(res.managerName ? `Account manager: ${res.managerName}` : "Account manager cleared");
      utils.customers.invalidate();
      utils.team.workload.invalidate();
      onChanged?.();
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const setCollector = trpc.customers.setCollector.useMutation({
    onSuccess: res => {
      toast.success(res.collectorName ? `Collector: ${res.collectorName}` : "Collector cleared");
      utils.customers.invalidate();
      utils.team.workload.invalidate();
      onChanged?.();
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={isCollector ? "Collector — chases these receivables" : "Account manager — handles all cases of this customer"}
        >
          {person ? (
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white select-none"
              style={{ backgroundColor: watcherColor(person.name) }}
            >
              {watcherInitials(person.name)}
            </span>
          ) : (
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground">
              {isCollector ? <HandCoins className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium leading-tight">
              {person ? person.name : isCollector ? "Assign collector" : "Assign manager"}
            </span>
            <span className="block truncate text-[11px] leading-tight text-muted-foreground">
              {person ? subtitle : roleName}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-2">
          <div className="text-sm font-medium">{groupName ? `Group ${roleName.toLowerCase()}` : roleName}</div>
          <p className="text-xs text-muted-foreground">
            {isCollector
              ? "Responsible for collecting this customer's receivables."
              : "Handles all cases of this customer."}
            {groupName ? " Applies to every company in this group." : ""}
          </p>
          <TeamMemberSelect
            value={person?.id ?? null}
            onChange={id =>
              isCollector
                ? setCollector.mutate(groupName ? { collectorId: id, groupName } : { collectorId: id, customerId: customerId! })
                : setManager.mutate(groupName ? { managerId: id, groupName } : { managerId: id, customerId: customerId! })
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PeopleRow({
  manager,
  collector,
  watchers = [],
  watcherGroupName,
  customerId,
  groupName,
  onChanged,
}: {
  manager: PersonInfo | null;
  collector: PersonInfo | null;
  watchers?: WatcherRow[];
  /** Group key watchers are stored under (same for a company and its group). */
  watcherGroupName: string;
  customerId?: number;
  groupName?: string;
  onChanged?: () => void;
}) {
  const utils = trpc.useUtils();
  const [pickerOpen, setPickerOpen] = useState(false);
  const addWatcher = trpc.customers.addWatcher.useMutation({
    onSuccess: res => {
      toast.success(`${res.name} is now watching`);
      utils.customers.invalidate();
      onChanged?.();
      setPickerOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const removeWatcher = trpc.customers.removeWatcher.useMutation({
    onSuccess: () => {
      utils.customers.invalidate();
      onChanged?.();
    },
    onError: e => toast.error(e.message),
  });
  const watching = new Set(watchers.map(w => w.memberId));

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-2 py-1.5">
      <PersonSlot person={collector} role="collector" customerId={customerId} groupName={groupName} onChanged={onChanged} />
      <span className="h-8 w-px bg-border" aria-hidden />
      <PersonSlot person={manager} role="manager" customerId={customerId} groupName={groupName} onChanged={onChanged} />
      <span className="h-8 w-px bg-border" aria-hidden />
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Eye className="h-3.5 w-3.5" /> Watchers
        </span>
        {watchers.length === 0 && <span className="text-xs text-muted-foreground">none</span>}
        {watchers.map(w => (
          <Tooltip key={w.memberId}>
            <TooltipTrigger asChild>
              <span className="group relative inline-flex">
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-background select-none"
                  style={{ backgroundColor: watcherColor(w.name) }}
                >
                  {watcherInitials(w.name)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${w.name} from watchers`}
                  onClick={() => removeWatcher.mutate({ groupName: watcherGroupName, memberId: w.memberId })}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:inline-flex"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {w.name}
              {w.title ? ` — ${w.title}` : ""}
            </TooltipContent>
          </Tooltip>
        ))}
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" title="Add a colleague as watcher">
              <Plus className="h-3 w-3" /> Watcher
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-2">
              <div className="text-sm font-medium">Add watcher</div>
              <p className="text-xs text-muted-foreground">
                Watchers follow this account's receivables without owning it — useful for sales,
                accounting or management who need visibility.
              </p>
              <TeamMemberSelect
                value={null}
                excludeIds={Array.from(watching)}
                emptyLabel="Search colleagues…"
                onChange={id => {
                  if (id != null) addWatcher.mutate({ groupName: watcherGroupName, memberId: id });
                }}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
