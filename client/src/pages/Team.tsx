import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Plus, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";

type MemberForm = {
  id?: number;
  name: string;
  email: string;
  phone: string;
  title: string;
};

const emptyForm: MemberForm = { name: "", email: "", phone: "", title: "" };

/**
 * Team page — manage collaborators who act as account managers for customers
 * and take on tasks. Shows each member's workload (managed groups/companies
 * and open tasks).
 */
export default function Team() {
  const utils = trpc.useUtils();
  const { data: members, isLoading } = trpc.team.workload.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const invalidate = () => {
    utils.team.list.invalidate();
    utils.team.workload.invalidate();
  };

  const createMember = trpc.team.create.useMutation({
    onSuccess: () => {
      toast.success("Team member added");
      invalidate();
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateMember = trpc.team.update.useMutation({
    onSuccess: () => {
      toast.success("Team member updated");
      invalidate();
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const removeMember = trpc.team.remove.useMutation({
    onSuccess: () => {
      toast.success("Team member deleted");
      invalidate();
      setDeleteId(null);
    },
    onError: e => toast.error(e.message),
  });

  const openNew = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };
  const openEdit = (m: NonNullable<typeof members>[number]) => {
    setForm({ id: m.id, name: m.name, email: m.email ?? "", phone: m.phone ?? "", title: m.title ?? "" });
    setDialogOpen(true);
  };
  const save = () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      title: form.title.trim() || undefined,
    };
    if (form.id) {
      updateMember.mutate({ id: form.id, ...payload, email: payload.email ?? null, phone: payload.phone ?? null, title: payload.title ?? null });
    } else {
      createMember.mutate(payload);
    }
  };

  const deleting = members?.find(m => m.id === deleteId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> Team
          </h1>
          <p className="text-sm text-muted-foreground">
            Collaborators who manage customers and take on tasks. Assign a responsible person on any customer, group or task.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1.5" /> New Member
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !members || members.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <UserRound className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No team members yet. Add your first member to start assigning customers and tasks.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map(m => (
                  <TableRow key={m.id} className={m.active ? "" : "opacity-60"}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.title || "—"}</TableCell>
                    <TableCell className="text-sm">{m.email || "—"}</TableCell>
                    <TableCell className="text-sm">{m.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={m.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500"}>
                        {m.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit" onClick={() => openEdit(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs"
                          onClick={() => updateMember.mutate({ id: m.id, active: !m.active })}
                        >
                          {m.active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Delete" onClick={() => setDeleteId(m.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Member" : "New Team Member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Maria Papadopoulou" />
            </div>
            <div className="space-y-1.5">
              <Label>Title / Role</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Credit Controller" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+30 ..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name.trim() || createMember.isPending || updateMember.isPending}>
              {form.id ? "Save Changes" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team member?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `"${deleting.name}" will be removed and detached from ${deleting.companies} company(ies) and their tasks. ` : ""}
              This cannot be undone. Consider deactivating instead to keep history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId !== null && removeMember.mutate({ id: deleteId })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
