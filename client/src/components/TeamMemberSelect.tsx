import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus, UserRound, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Team member picker — used for assigning account managers to customers/groups
 * and assignees to tasks.
 *
 * A plain dropdown stopped working once the team grew past a handful of people,
 * so this is a searchable combobox: type a name or a title and the list narrows
 * down. Inline creation of a new member is still available.
 */
export function TeamMemberSelect({
  value,
  onChange,
  placeholder = "Unassigned",
  allowCreate = true,
  className,
  /** Member ids that cannot be chosen, e.g. yourself when asking someone else for help. */
  excludeIds,
  /** Label shown when nothing is selected — defaults to "— {placeholder} —". */
  emptyLabel,
}: {
  /** Selected team member id, or null when unassigned. */
  value: number | null;
  onChange: (memberId: number | null) => void;
  placeholder?: string;
  allowCreate?: boolean;
  className?: string;
  excludeIds?: number[];
  emptyLabel?: string;
}) {
  const utils = trpc.useUtils();
  const { data: members } = trpc.team.list.useQuery();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);

  const selectable = useMemo(
    () => (members ?? []).filter(m => !(excludeIds ?? []).includes(m.id)),
    [members, excludeIds],
  );
  const selected = (members ?? []).find(m => m.id === value) ?? null;

  const createMember = trpc.team.create.useMutation({
    onSuccess: async res => {
      toast.success("Team member added");
      await utils.team.list.invalidate();
      onChange(res.id);
      setCreating(false);
      setNewName("");
    },
    onError: e => toast.error(e.message),
  });

  if (creating) {
    return (
      <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
        <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          autoFocus
          placeholder="New member name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && newName.trim()) {
              e.preventDefault();
              createMember.mutate({ name: newName.trim() });
            }
            if (e.key === "Escape") setCreating(false);
          }}
          className="h-9"
        />
        <Button
          size="sm"
          className="h-9 shrink-0"
          disabled={!newName.trim() || createMember.isPending}
          onClick={() => createMember.mutate({ name: newName.trim() })}
        >
          Save
        </Button>
        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => setCreating(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex-1 justify-between bg-background font-normal"
          >
            <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>
              {selected ? `${selected.name}${selected.title ? ` · ${selected.title}` : ""}` : (emptyLabel ?? `— ${placeholder} —`)}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search colleague…" />
            <CommandList>
              <CommandEmpty>No colleague found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value={emptyLabel ?? placeholder}
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check className={`mr-2 h-4 w-4 ${value == null ? "opacity-100" : "opacity-0"}`} />
                  {emptyLabel ?? `— ${placeholder} —`}
                </CommandItem>
                {selectable.map(m => (
                  <CommandItem
                    key={m.id}
                    // Searched text: name and title together, so "finance" finds the controller.
                    value={`${m.name} ${m.title ?? ""}`}
                    onSelect={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${value === m.id ? "opacity-100" : "opacity-0"}`} />
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
      {allowCreate && (
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0"
          title="Add new team member"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
