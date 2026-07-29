import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, UserRound, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Team member picker — used for assigning account managers to customers/groups
 * and assignees to tasks. Supports inline creation of a new member.
 */
export function TeamMemberSelect({
  value,
  onChange,
  placeholder = "Unassigned",
  allowCreate = true,
  className,
}: {
  /** Selected team member id, or null when unassigned. */
  value: number | null;
  onChange: (memberId: number | null) => void;
  placeholder?: string;
  allowCreate?: boolean;
  className?: string;
}) {
  const utils = trpc.useUtils();
  const { data: members } = trpc.team.list.useQuery();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

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
      <Select
        value={value ? String(value) : "none"}
        onValueChange={v => onChange(v === "none" ? null : Number(v))}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— {placeholder} —</SelectItem>
          {(members ?? []).map(m => (
            <SelectItem key={m.id} value={String(m.id)}>
              {m.name}
              {m.title ? ` · ${m.title}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
