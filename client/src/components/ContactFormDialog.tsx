/**
 * Create/edit dialog for payment contacts, shared by the Address Book and any
 * other surface that needs to maintain contacts. Contacts belong to a group; a
 * group can span several legal entities, so the underlying customer row is
 * chosen behind the scenes from the group's representative company.
 */
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export type ContactRow = {
  id: number;
  customerId: number;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  companyName: string;
  groupName: string;
};

export function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: ContactRow | null; // null = create new
  onSaved?: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: customers } = trpc.customers.list.useQuery(undefined, { enabled: open && !contact });
  const [groupName, setGroupName] = useState<string>("");
  const [name, setName] = useState(contact?.name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [title, setTitle] = useState(contact?.title ?? "");

  const groups = useMemo(() => {
    if (!customers) return [] as { group: string; customerId: number }[];
    const map = new Map<string, number>();
    for (const c of customers) {
      const g = ((c as { customerGroup?: string | null }).customerGroup ?? "").trim() || c.name;
      if (!map.has(g)) map.set(g, c.id);
      // A company whose own name equals the group name is the best representative.
      if (c.name === g) map.set(g, c.id);
    }
    const out: { group: string; customerId: number }[] = [];
    map.forEach((customerId, group) => out.push({ group, customerId }));
    return out.sort((a, b) => a.group.localeCompare(b.group));
  }, [customers]);

  const onDone = () => {
    utils.paymentContacts.listAll.invalidate();
    onSaved?.();
    onOpenChange(false);
  };
  const add = trpc.paymentContacts.add.useMutation({
    onSuccess: () => {
      toast.success("Contact added");
      onDone();
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.paymentContacts.update.useMutation({
    onSuccess: () => {
      toast.success("Contact updated");
      onDone();
    },
    onError: e => toast.error(e.message),
  });

  const save = () => {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (contact) {
      update.mutate({
        id: contact.id,
        customerId: contact.customerId,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        title: title.trim() || undefined,
      });
      return;
    }
    const target = groups.find(g => g.group === groupName);
    if (!target) {
      toast.error("Select a group");
      return;
    }
    add.mutate({
      customerId: target.customerId,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      title: title.trim() || undefined,
    });
  };

  const busy = add.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit Contact" : "New Contact"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {contact ? (
            <div className="text-sm text-muted-foreground">
              Group: <span className="font-medium text-foreground">{contact.groupName}</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Group *</Label>
              <Select value={groupName || undefined} onValueChange={setGroupName}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select group…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {groups.map(g => (
                    <SelectItem key={g.group} value={g.group}>
                      {g.group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Contact name" />
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+30…" />
            </div>
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Accounts Payable" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
