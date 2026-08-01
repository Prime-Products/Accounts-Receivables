/**
 * Field designer for the Address Book. Users add their own fields per entity
 * (text, number, date, list, checkbox, email, phone, url); values are stored
 * separately from the ERP columns, so a sync never overwrites them and no
 * database migration is needed to add a field.
 */
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Archive, Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type AddressBookEntity = "group" | "customer" | "vessel" | "contact";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "longtext", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "List of values" },
  { value: "checkbox", label: "Yes / No" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "Link" },
] as const;

const ENTITY_LABELS: Record<AddressBookEntity, string> = {
  group: "Groups",
  customer: "Companies",
  vessel: "Vessels",
  contact: "Contacts",
};

export function CustomFieldsManager({ entity }: { entity: AddressBookEntity }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: fields } = trpc.addressBook.fields.useQuery({ entity }, { enabled: open });
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<string>("text");
  const [optionsText, setOptionsText] = useState("");
  const [required, setRequired] = useState(false);

  const invalidate = () => {
    utils.addressBook.fields.invalidate();
    utils.addressBook.groups.invalidate();
    utils.addressBook.customers.invalidate();
    utils.addressBook.vessels.invalidate();
    utils.addressBook.contacts.invalidate();
    utils.addressBook.recordFields.invalidate();
  };

  const createField = trpc.addressBook.createField.useMutation({
    onSuccess: () => {
      toast.success("Field added");
      setLabel("");
      setOptionsText("");
      setRequired(false);
      setFieldType("text");
      invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const archiveField = trpc.addressBook.archiveField.useMutation({
    onSuccess: () => {
      toast.success("Field archived — stored values are kept");
      invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    if (!label.trim()) {
      toast.error("Give the field a name");
      return;
    }
    const options = optionsText
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean);
    if (fieldType === "select" && options.length === 0) {
      toast.error("A list field needs at least one value");
      return;
    }
    createField.mutate({
      entity,
      label: label.trim(),
      fieldType: fieldType as "text",
      options: options.length > 0 ? options : undefined,
      required,
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Settings2 className="h-4 w-4" /> Fields
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Custom fields — {ENTITY_LABELS[entity]}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border divide-y max-h-56 overflow-auto">
              {(fields ?? []).length === 0 ? (
                <p className="px-3 py-6 text-sm text-muted-foreground text-center">
                  No custom fields yet. Add one below and it appears on the cards, as a column and in exports.
                </p>
              ) : (
                (fields ?? []).map(f => (
                  <div key={f.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {f.label}
                        {f.required === 1 && <span className="text-red-600"> *</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {FIELD_TYPES.find(t => t.value === f.fieldType)?.label ?? f.fieldType}
                        {f.options ? ` · ${(JSON.parse(f.options) as string[]).length} values` : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Archive this field (values are kept)"
                      onClick={() => archiveField.mutate({ id: f.id })}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Add a field</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Base port" />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={fieldType} onValueChange={setFieldType}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {fieldType === "select" && (
                <div className="space-y-1.5">
                  <Label>Values (one per line or comma separated)</Label>
                  <Input
                    value={optionsText}
                    onChange={e => setOptionsText(e.target.value)}
                    placeholder="Piraeus, Limassol, Singapore"
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label className="font-normal">Required on the card</Label>
                <Switch checked={required} onCheckedChange={setRequired} />
              </div>
              <Button size="sm" className="gap-1.5" onClick={submit} disabled={createField.isPending}>
                <Plus className="h-4 w-4" /> {createField.isPending ? "Adding…" : "Add field"}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
