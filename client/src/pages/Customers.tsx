import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtEur, onHoldStatusColors, tierColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const TIERS = ["Platinum", "Gold", "Silver", "Bronze", "New"] as const;

export default function Customers() {
  const { data, isLoading } = trpc.customers.list.useQuery();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    vatNumber: "",
    email: "",
    phone: "",
    contactPerson: "",
    tier: "New" as (typeof TIERS)[number],
    creditLimit: "0",
    paymentTermsDays: "30",
  });

  const create = trpc.customers.create.useMutation({
    onSuccess: () => {
      toast.success("Customer created");
      utils.customers.list.invalidate();
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter(c => {
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase());
      const matchesTier = tierFilter === "all" || c.tier === tierFilter;
      return matchesSearch && matchesTier;
    });
  }, [data, search, tierFilter]);

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" /> Customers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tiers: Platinum / Gold / Silver / Bronze / New — click a row for the Customer 360 View
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Customer</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Code *</Label>
                <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="C-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>VAT Number</Label>
                <Input value={form.vatNumber} onChange={e => setForm({ ...form, vatNumber: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tier</Label>
                <Select value={form.tier} onValueChange={v => setForm({ ...form, tier: v as any })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map(t => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Person</Label>
                <Input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Credit Limit (€)</Label>
                <Input type="number" value={form.creditLimit} onChange={e => setForm({ ...form, creditLimit: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Terms (days)</Label>
                <Input
                  type="number"
                  value={form.paymentTermsDays}
                  onChange={e => setForm({ ...form, paymentTermsDays: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!form.code || !form.name || create.isPending}
                onClick={() =>
                  create.mutate({
                    code: form.code,
                    name: form.name,
                    vatNumber: form.vatNumber || undefined,
                    email: form.email || undefined,
                    phone: form.phone || undefined,
                    contactPerson: form.contactPerson || undefined,
                    tier: form.tier,
                    creditLimit: Number(form.creditLimit || 0),
                    paymentTermsDays: Number(form.paymentTermsDays || 30),
                  })
                }
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name or code…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            {TIERS.map(t => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              No customers yet. Create one or pull them from Softone in Settings.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Open Balance</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Credit Limit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)}>
                    <TableCell className="font-mono text-sm">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={tierColors[c.tier]}>
                        {c.tier}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={onHoldStatusColors[c.onHoldStatus] ?? ""}>
                        {c.onHoldStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmtEur(c.openBalance)}</TableCell>
                    <TableCell className={`text-right font-mono ${c.overdueBalance > 0 ? "text-red-600 font-semibold" : ""}`}>
                      {fmtEur(c.overdueBalance)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmtEur(c.creditLimit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
