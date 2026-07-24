import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X, Mail, Phone, TrendingDown, Calendar } from "lucide-react";
import { fmtEur, fmtDate } from "@/lib/format";
import { toast } from "sonner";

interface GroupWorkspaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: {
    name: string;
    overdue: number;
    overdueEom?: number;
    forecast?: number;
    status?: string;
    rating?: string;
    contacts?: Array<{
      name?: string;
      email?: string | null;
      phone?: string | null;
      role?: string;
    }>;
  };
}

export function GroupWorkspace({ open, onOpenChange, group }: GroupWorkspaceProps) {
  const [callNotes, setCallNotes] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("friendly");
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());

  // Mock data - in real app, fetch from API
  const invoices = [
    { id: "INV-001", date: "2026-07-15", amount: 5000, aging: 9, notes: "Pending approval" },
    { id: "INV-002", date: "2026-07-10", amount: 3500, aging: 14, notes: "Disputed amount" },
    { id: "INV-003", date: "2026-06-15", amount: 2200, aging: 39, notes: "" },
    { id: "INV-004", date: "2026-05-20", amount: 8000, aging: 65, notes: "Promised 2026-08-01" },
    { id: "INV-005", date: "2026-04-10", amount: 4500, aging: 105, notes: "Legal review pending" },
  ];

  const paymentHistory = [
    { date: "2026-07-20", amount: 12000, days: 25 },
    { date: "2026-06-15", amount: 8500, days: 32 },
    { date: "2026-05-10", amount: 6200, days: 28 },
  ];

  const agingBuckets = [
    { range: "0-30 days", amount: 8500, count: 2 },
    { range: "31-60 days", amount: 3500, count: 1 },
    { range: "61-90 days", amount: 2200, count: 1 },
    { range: "91-120 days", amount: 4000, count: 1 },
    { range: "120+ days", amount: 4500, count: 1 },
  ];

  const activityLog = [
    { date: "2026-07-24 14:30", type: "Call", description: "Spoke with CFO - promised payment by 28th", user: "You" },
    { date: "2026-07-23 10:15", type: "Email", description: "Sent Final Notice", user: "You" },
    { date: "2026-07-20 16:45", type: "Task", description: "Follow-up call scheduled", user: "System" },
    { date: "2026-07-18 09:00", type: "Promise", description: "Promise recorded - Due 2026-07-28", user: "You" },
    { date: "2026-07-15 11:30", type: "Note", description: "Customer experiencing cash flow issues", user: "You" },
  ];

  const emailTemplates = [
    { id: "friendly", label: "Friendly Reminder", subject: "Payment Reminder - Invoice {{invoice}}" },
    { id: "final", label: "Final Notice", subject: "Final Notice - Immediate Payment Required" },
    { id: "statement", label: "Statement", subject: "Account Statement as of {{date}}" },
    { id: "custom", label: "Custom", subject: "Custom Message" },
  ];

  const handleSendEmail = () => {
    if (!messageTemplate) {
      toast.error("Please select a template");
      return;
    }
    toast.success("Email sent successfully");
  };

  const handleLogCall = () => {
    if (!callNotes.trim()) {
      toast.error("Please enter call notes");
      return;
    }
    toast.success("Call logged successfully");
    setCallNotes("");
  };

  const handlePromiseToPay = () => {
    if (!promiseDate) {
      toast.error("Please select a promise date");
      return;
    }
    toast.success(`Promise recorded for ${promiseDate}`);
    setPromiseDate("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
              {group.status && (
                <Badge className="bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-50">
                  {group.status}
                </Badge>
              )}
              {group.rating && (
                <Badge className="bg-blue-50 text-blue-700 border border-blue-300 hover:bg-blue-50">
                  Rating: {group.rating}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Total Overdue</div>
                <div className="text-2xl font-bold text-red-600">{fmtEur(group.overdue)}</div>
              </div>
              {group.overdueEom && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Overdue EOM</div>
                  <div className="text-2xl font-bold text-orange-600">{fmtEur(group.overdueEom)}</div>
                </div>
              )}
              {group.forecast && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">AI Forecast</div>
                  <div className="text-2xl font-bold text-green-600">{fmtEur(group.forecast)}</div>
                </div>
              )}
            </div>
            {/* Contacts */}
            {group.contacts && group.contacts.length > 0 && (
              <div className="flex gap-4 text-sm">
                {group.contacts.map((contact, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {contact.phone}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogClose className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </DialogClose>
        </div>

        {/* Tabs */}
        <div className="p-6">
          <Tabs defaultValue="invoices" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="payment">Payment History</TabsTrigger>
              <TabsTrigger value="aging">Aging</TabsTrigger>
              <TabsTrigger value="activity">Activity Log</TabsTrigger>
            </TabsList>

            {/* Invoices Tab */}
            <TabsContent value="invoices" className="space-y-4">
              <div className="border border-gray-200 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Invoice #</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Amount</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">Aging (days)</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-gray-900">{inv.id}</td>
                        <td className="px-4 py-3 text-gray-600">{fmtDate(new Date(inv.date).getTime())}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">{fmtEur(inv.amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                            inv.aging <= 30 ? "bg-green-50 text-green-700" :
                            inv.aging <= 60 ? "bg-yellow-50 text-yellow-700" :
                            inv.aging <= 90 ? "bg-orange-50 text-orange-700" :
                            inv.aging <= 120 ? "bg-red-50 text-red-600" :
                            "bg-red-100 text-red-800"
                          }`}>
                            {inv.aging}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{inv.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Payment History Tab */}
            <TabsContent value="payment" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Recent Payments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {paymentHistory.map((payment, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 border border-gray-200 rounded">
                        <div>
                          <div className="font-medium text-gray-900">{fmtDate(new Date(payment.date).getTime())}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <TrendingDown className="h-3 w-3" /> Avg {payment.days} days to pay
                          </div>
                        </div>
                        <div className="text-lg font-bold text-green-600">{fmtEur(payment.amount)}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aging Tab */}
            <TabsContent value="aging" className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                {agingBuckets.map((bucket, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 border border-gray-200 rounded">
                    <div>
                      <div className="font-medium text-gray-900">{bucket.range}</div>
                      <div className="text-xs text-gray-500">{bucket.count} invoice(s)</div>
                    </div>
                    <div className="text-lg font-bold text-red-600">{fmtEur(bucket.amount)}</div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Activity Log Tab */}
            <TabsContent value="activity" className="space-y-3">
              {activityLog.map((log, idx) => (
                <div key={idx} className="flex gap-4 p-3 border border-gray-200 rounded">
                  <div className="text-xs text-gray-500 whitespace-nowrap pt-1">{log.date}</div>
                  <div className="flex-1">
                    <Badge className="mb-1 bg-blue-50 text-blue-700 border border-blue-300">{log.type}</Badge>
                    <div className="text-sm text-gray-700">{log.description}</div>
                    <div className="text-xs text-gray-500 mt-1">by {log.user}</div>
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </div>

        {/* Actions Section */}
        <div className="border-t border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Actions</h2>

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" className="w-full">Log Call</Button>
            <Button size="sm" variant="outline" className="w-full">Send Email</Button>
            <Button size="sm" variant="outline" className="w-full">Create Task</Button>
            <Button size="sm" variant="outline" className="w-full">Promise-to-Pay</Button>
          </div>

          {/* Call Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Call Notes</label>
            <Textarea
              placeholder="Enter call notes..."
              value={callNotes}
              onChange={(e) => setCallNotes(e.target.value)}
              className="text-sm"
            />
            <Button size="sm" className="w-full" onClick={handleLogCall}>
              Log Call
            </Button>
          </div>

          {/* Promise to Pay */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Promise to Pay Date</label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={promiseDate}
                onChange={(e) => setPromiseDate(e.target.value)}
                className="text-sm"
              />
              <Button size="sm" variant="outline" onClick={handlePromiseToPay}>
                Record
              </Button>
            </div>
          </div>

          {/* Email Templates */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Send Email</label>
            <Select value={messageTemplate} onValueChange={setMessageTemplate}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {emailTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSendEmail}>
              Send Email
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
