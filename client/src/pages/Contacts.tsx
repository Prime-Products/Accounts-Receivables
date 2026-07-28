import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { trpc } from "@/lib/trpc";
import { Contact, Mail, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ContactRow = {
  id: number;
  customerId: number;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  companyName: string;
  groupName: string;
};

function ContactFormDialog({
  open,
  onOpenChange,
  contact,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: ContactRow | null; // null = create new
}) {
  const utils = trpc.useUtils();
  const { data: customers } = trpc.customers.list.useQuery(undefined, { enabled: open && !contact });
  const [customerId, setCustomerId] = useState<string>(contact ? String(contact.customerId) : "");
  const [name, setName] = useState(contact?.name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [title, setTitle] = useState(contact?.title ?? "");

  const onDone = () => {
    utils.paymentContacts.listAll.invalidate();
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
    } else {
      if (!customerId) {
        toast.error("Select a company");
        return;
      }
      add.mutate({
        customerId: Number(customerId),
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        title: title.trim() || undefined,
      });
    }
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
              Company: <span className="font-medium text-foreground">{contact.companyName}</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Company *</Label>
              <Select value={customerId || undefined} onValueChange={setCustomerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select company…" />
                </SelectTrigger>
                <SelectContent>
                  {(customers ?? []).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
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
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" />
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

export default function Contacts() {
  const { data: contacts, isLoading } = trpc.paymentContacts.listAll.useQuery();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const cols = useResizableColumns("contacts", {
    name: 200,
    position: 140,
    email: 240,
    phone: 160,
    company: 220,
    group: 200,
    actions: 90,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [deleting, setDeleting] = useState<ContactRow | null>(null);

  const del = trpc.paymentContacts.delete.useMutation({
    onSuccess: () => {
      toast.success("Contact deleted");
      utils.paymentContacts.listAll.invalidate();
      setDeleting(null);
    },
    onError: e => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!contacts) return [];
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.title ?? "").toLowerCase().includes(q) ||
        c.companyName.toLowerCase().includes(q) ||
        c.groupName.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Contact className="h-6 w-6" /> Contacts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Payment contacts across all customers — used in Log Call and Send Email
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> New Contact
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, email, company, group…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table className="table-fixed" style={{ width: cols.totalWidth, minWidth: "100%" }}>
            <TableHeader>
              <TableRow>
                {(
                  [
                    ["name", "Name"],
                    ["position", "Position"],
                    ["email", "Email"],
                    ["phone", "Phone"],
                    ["company", "Company"],
                    ["group", "Group"],
                  ] as const
                ).map(([key, label]) => (
                  <TableHead key={key} className="relative" style={cols.style(key)}>
                    <span className="block truncate pr-1">{label}</span>
                    <ColResizer col={key} api={cols} />
                  </TableHead>
                ))}
                <TableHead className="text-right" style={cols.style("actions")}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {search ? "No contacts match your search" : "No contacts yet — add your first one"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.title || "—"}</TableCell>
                    <TableCell>
                      <a className="text-blue-600 hover:underline inline-flex items-center gap-1" href={`mailto:${c.email}`}>
                        <Mail className="h-3 w-3" /> {c.email}
                      </a>
                    </TableCell>
                    <TableCell>
                      {c.phone ? (
                        <a className="text-blue-600 hover:underline inline-flex items-center gap-1" href={`tel:${c.phone}`}>
                          <Phone className="h-3 w-3" /> {c.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{c.companyName}</TableCell>
                    <TableCell>
                      <button
                        className="text-left hover:underline decoration-dotted underline-offset-2"
                        onClick={() => navigate(`/groups/${encodeURIComponent(c.groupName)}`)}
                      >
                        {c.groupName}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Edit"
                          onClick={() => {
                            setEditing(c);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600 hover:text-red-700"
                          title="Delete"
                          onClick={() => setDeleting(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && contacts && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {contacts.length} contact(s)
        </p>
      )}

      {formOpen && (
        <ContactFormDialog key={editing?.id ?? "new"} open={formOpen} onOpenChange={setFormOpen} contact={editing} />
      )}

      <AlertDialog open={!!deleting} onOpenChange={v => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deleting?.name} ({deleting?.email}) from {deleting?.companyName}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleting && del.mutate({ id: deleting.id, customerId: deleting.customerId })}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
