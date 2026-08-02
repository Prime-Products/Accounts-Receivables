/**
 * PeopleRow — "who is on this account", compact enough to sit in the title line.
 *
 * It started as a bordered strip with 32px avatars, full names and job titles,
 * which took a whole row of the card for information the collector already knows.
 * It is now a single inline run of small avatars with just the FIRST name, placed
 * next to the status badges: the full name, the role and the job title stay one
 * hover away, and clicking still re-assigns the person. Watchers are the avatar
 * stack plus a bare "+" — no label, no "none", no button text.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TeamMemberSelect } from "@/components/TeamMemberSelect";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { watcherColor, watcherInitials } from "@/components/WatcherStack";
import { Plus, X, UserRound, HandCoins } from "lucide-react";
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

/** "Kostas Vanos" → "Kostas": inside one account card the first name is enough. */
export function firstName(name: string): string {
  return (name ?? "").trim().split(/\s+/)[0] || name;
}

/** One clickable person: small avatar + first name. Everything else is in the tooltip. */
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
  const title = (person?.title ?? "").trim();

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
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {person ? (
                <span
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white select-none"
                  style={{ backgroundColor: watcherColor(person.name) }}
                >
                  {watcherInitials(person.name)}
                </span>
              ) : (
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground">
                  {isCollector ? <HandCoins className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                </span>
              )}
              <span className="max-w-[100px] truncate text-xs font-medium">
                {person ? firstName(person.name) : isCollector ? "Collector" : "Manager"}
              </span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {person ? (
            <>
              {roleName}: {person.name}
              {title ? ` — ${title}` : ""}
            </>
          ) : (
            <>Assign {roleName.toLowerCase()}</>
          )}
        </TooltipContent>
      </Tooltip>
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
  // Everyone on the team who is not already watching this account.
  const { data: teamMembers } = trpc.team.list.useQuery();
  const candidates = useMemo(
    () => (teamMembers ?? []).filter(m => !watching.has(m.id)),
    [teamMembers, watchers],
  );

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-1">
      <PersonSlot person={collector} role="collector" customerId={customerId} groupName={groupName} onChanged={onChanged} />
      <PersonSlot person={manager} role="manager" customerId={customerId} groupName={groupName} onChanged={onChanged} />
      {/* Watchers: avatars only, overlapping like everywhere else in the app. */}
      {watchers.length > 0 && (
        <span className="ml-1 inline-flex items-center -space-x-1.5">
          {watchers.map(w => (
            <Tooltip key={w.memberId}>
              <TooltipTrigger asChild>
                <span className="group relative inline-flex">
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ring-background select-none"
                    style={{ backgroundColor: watcherColor(w.name) }}
                  >
                    {watcherInitials(w.name)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${w.name} from watchers`}
                    onClick={() => removeWatcher.mutate({ groupName: watcherGroupName, memberId: w.memberId })}
                    className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:inline-flex"
                  >
                    <X className="h-2 w-2" />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Watching: {w.name}
                {w.title ? ` — ${w.title}` : ""}
              </TooltipContent>
            </Tooltip>
          ))}
        </span>
      )}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Add watcher"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-3 w-3" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Add watcher</TooltipContent>
        </Tooltip>
        {/*
         * The "+" used to open a card explaining what a watcher is, above a combobox
         * that needed a second click to reveal the names. Adding a watcher is a
         * two-second action for someone who already knows the concept, so the
         * popover now IS the searchable list: click, type, pick.
         */}
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search colleague…" autoFocus />
            <CommandList>
              <CommandEmpty>No colleague found.</CommandEmpty>
              <CommandGroup>
                {candidates.map(m => (
                  <CommandItem
                    key={m.id}
                    // Name and title are both searchable, so "finance" finds the controller.
                    value={`${m.name} ${m.title ?? ""}`}
                    onSelect={() => addWatcher.mutate({ groupName: watcherGroupName, memberId: m.id })}
                  >
                    <span
                      className="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white select-none"
                      style={{ backgroundColor: watcherColor(m.name) }}
                    >
                      {watcherInitials(m.name)}
                    </span>
                    <span className="truncate">
                      {m.name}
                      {m.title ? <span className="text-muted-foreground"> · {m.title}</span> : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </span>
  );
}
