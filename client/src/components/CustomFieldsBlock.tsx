/**
 * "Custom fields" block rendered on every Address Book record card. Each field
 * saves on blur, so filling in a card feels like editing a form rather than
 * opening a dialog per value.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export type AddressBookEntity = "group" | "customer" | "vessel" | "contact";

export function CustomFieldsBlock({ entity, recordKey }: { entity: AddressBookEntity; recordKey: string }) {
  const utils = trpc.useUtils();
  const { data: fields, isLoading } = trpc.addressBook.recordFields.useQuery({ entity, recordKey });
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  // Reset local drafts whenever a different record is opened.
  useEffect(() => {
    setDrafts({});
  }, [recordKey, entity]);

  const setValue = trpc.addressBook.setFieldValue.useMutation({
    onSuccess: () => {
      utils.addressBook.recordFields.invalidate({ entity, recordKey });
      utils.addressBook[entity === "group" ? "groups" : entity === "customer" ? "customers" : entity === "vessel" ? "vessels" : "contacts"].invalidate();
    },
    onError: e => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!fields || fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No custom fields defined yet. Use “Fields” in the toolbar to add your own.
      </p>
    );
  }

  const commit = (fieldId: number, value: string) => setValue.mutate({ fieldId, recordKey, value: value || null });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map(f => {
        const current = drafts[f.id] ?? f.value;
        return (
          <div key={f.id} className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {f.label}
              {f.required && <span className="text-red-600"> *</span>}
            </Label>
            {f.fieldType === "longtext" ? (
              <Textarea
                rows={2}
                value={current}
                onChange={e => setDrafts(d => ({ ...d, [f.id]: e.target.value }))}
                onBlur={() => current !== f.value && commit(f.id, current)}
              />
            ) : f.fieldType === "select" ? (
              <Select
                value={current || undefined}
                onValueChange={v => {
                  setDrafts(d => ({ ...d, [f.id]: v }));
                  commit(f.id, v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {f.options.map(o => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : f.fieldType === "checkbox" ? (
              <div className="h-9 flex items-center">
                <Switch
                  checked={current === "1"}
                  onCheckedChange={v => {
                    const next = v ? "1" : "";
                    setDrafts(d => ({ ...d, [f.id]: next }));
                    commit(f.id, next);
                  }}
                />
              </div>
            ) : (
              <Input
                type={
                  f.fieldType === "number"
                    ? "number"
                    : f.fieldType === "date"
                      ? "date"
                      : f.fieldType === "email"
                        ? "email"
                        : "text"
                }
                value={current}
                placeholder={f.helpText ?? undefined}
                onChange={e => setDrafts(d => ({ ...d, [f.id]: e.target.value }))}
                onBlur={() => current !== f.value && commit(f.id, current)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
