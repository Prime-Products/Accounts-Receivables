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
import { Plus, Ship, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Vessel picker used on invoice forms (available on ALL invoices, optional).
 * Lets the user pick an existing vessel or create a new one inline without
 * leaving the form.
 */
export function VesselSelect({
  value,
  onChange,
  customerId,
}: {
  /** Selected vessel id, or null when no vessel. */
  value: number | null;
  onChange: (vesselId: number | null) => void;
  /** Optional customer to attach to newly created vessels. */
  customerId?: number | null;
}) {
  const utils = trpc.useUtils();
  const { data: vessels } = trpc.vessels.list.useQuery();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const createVessel = trpc.vessels.create.useMutation({
    onSuccess: async res => {
      toast.success("Vessel created");
      await utils.vessels.list.invalidate();
      onChange(res.id);
      setCreating(false);
      setNewName("");
    },
    onError: e => toast.error(e.message),
  });

  if (creating) {
    return (
      <div className="flex items-center gap-1.5">
        <Ship className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          autoFocus
          placeholder="New vessel name (e.g. MV OCEANIA)"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && newName.trim()) {
              e.preventDefault();
              createVessel.mutate({ name: newName.trim(), customerId: customerId ?? undefined });
            }
            if (e.key === "Escape") setCreating(false);
          }}
          className="h-9"
        />
        <Button
          size="sm"
          className="h-9 shrink-0"
          disabled={!newName.trim() || createVessel.isPending}
          onClick={() => createVessel.mutate({ name: newName.trim(), customerId: customerId ?? undefined })}
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
    <div className="flex items-center gap-1.5">
      <Select
        value={value ? String(value) : "none"}
        onValueChange={v => onChange(v === "none" ? null : Number(v))}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="No vessel" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— No vessel —</SelectItem>
          {(vessels ?? []).map(v => (
            <SelectItem key={v.id} value={String(v.id)}>
              {v.name}
              {v.imo ? ` (IMO ${v.imo})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9 shrink-0"
        title="Add new vessel"
        onClick={() => setCreating(true)}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
