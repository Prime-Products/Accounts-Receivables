/**
 * Duplicate merge. The user picks the survivor and then, field by field, which
 * value survives; the other contacts are archived (never deleted) with a pointer
 * back to the survivor so history stays traceable.
 */
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { trpc } from "@/lib/trpc";
import { Merge } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export type MergeCandidate = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  customerId: number;
  companyName: string;
  group: string;
};

const FIELDS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "title", label: "Position" },
  { key: "companyName", label: "Company" },
] as const;

export function MergeContactsDialog({
  candidates,
  open,
  onOpenChange,
  onMerged,
}: {
  candidates: MergeCandidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged?: () => void;
}) {
  const utils = trpc.useUtils();
  const [survivorId, setSurvivorId] = useState<number | null>(null);
  // Per field, the id of the contact whose value wins.
  const [picks, setPicks] = useState<Record<string, number>>({});

  // Default the survivor to the most complete record and the picks to it.
  const defaultSurvivor = useMemo(() => {
    const score = (c: MergeCandidate) =>
      [c.name, c.email, c.phone, c.title].filter(v => (v ?? "").trim() !== "").length;
    return [...candidates].sort((a, b) => score(b) - score(a))[0]?.id ?? null;
  }, [candidates]);

  const effectiveSurvivor = survivorId ?? defaultSurvivor;

  const valueOf = (c: MergeCandidate | undefined, key: string) => {
    if (!c) return "";
    const raw = (c as any)[key];
    return raw === null || raw === undefined || String(raw).trim() === "" ? "" : String(raw);
  };

  const pickedValue = (key: string) => {
    const from = candidates.find(c => c.id === (picks[key] ?? effectiveSurvivor));
    const own = valueOf(from, key);
    if (own) return own;
    // Fall back to the first non-empty value so the merge never loses data.
    for (const c of candidates) {
      const v = valueOf(c, key);
      if (v) return v;
    }
    return "";
  };

  const merge = trpc.addressBook.mergeContacts.useMutation({
    onSuccess: res => {
      toast.success(`Merged — ${res.archived} duplicate${res.archived === 1 ? "" : "s"} archived`);
      utils.addressBook.contacts.invalidate();
      utils.addressBook.quality.invalidate();
      utils.addressBook.counts.invalidate();
      utils.paymentContacts.invalidate();
      onOpenChange(false);
      setSurvivorId(null);
      setPicks({});
      onMerged?.();
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    if (!effectiveSurvivor) return;
    const companyFrom = candidates.find(c => c.id === (picks.companyName ?? effectiveSurvivor));
    merge.mutate({
      survivorId: effectiveSurvivor,
      loserIds: candidates.filter(c => c.id !== effectiveSurvivor).map(c => c.id),
      fields: {
        name: pickedValue("name") || "Unnamed",
        email: pickedValue("email"),
        phone: pickedValue("phone") || null,
        title: pickedValue("title") || null,
        customerId: companyFrom?.customerId ?? candidates[0].customerId,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Merge {candidates.length} contacts</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Keep this record</Label>
            <RadioGroup
              value={String(effectiveSurvivor ?? "")}
              onValueChange={v => setSurvivorId(Number(v))}
              className="grid gap-2 sm:grid-cols-2"
            >
              {candidates.map(c => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm hover:bg-accent/40"
                >
                  <RadioGroupItem value={String(c.id)} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.companyName}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="rounded-md border">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {FIELDS.map(f => {
                  const options = Array.from(
                    new Map(
                      candidates
                        .filter(c => valueOf(c, f.key))
                        .map(c => [valueOf(c, f.key), c] as const),
                    ).values(),
                  );
                  return (
                    <tr key={f.key}>
                      <td className="w-28 px-3 py-2 align-top text-xs text-muted-foreground">{f.label}</td>
                      <td className="px-3 py-2">
                        {options.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : options.length === 1 ? (
                          <span>{valueOf(options[0], f.key)}</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {options.map(c => {
                              const selected = (picks[f.key] ?? effectiveSurvivor) === c.id;
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => setPicks(p => ({ ...p, [f.key]: c.id }))}
                                  className={`rounded border px-2 py-1 text-xs transition-colors ${
                                    selected
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "hover:bg-accent/60"
                                  }`}
                                >
                                  {valueOf(c, f.key)}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            The other {Math.max(candidates.length - 1, 0)} record
            {candidates.length - 1 === 1 ? "" : "s"} will be archived, not deleted — you can restore them from the
            Archive view. Custom field values the survivor is missing are copied over.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="gap-1.5" onClick={submit} disabled={merge.isPending || !effectiveSurvivor}>
            <Merge className="h-4 w-4" /> {merge.isPending ? "Merging…" : "Merge contacts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
