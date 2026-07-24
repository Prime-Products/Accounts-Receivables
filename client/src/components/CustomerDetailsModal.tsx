import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Mail, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { fmtEur, fmtDate } from "@/lib/format";
import { toast } from "sonner";

interface CustomerDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: {
    name: string;
    overdue: number;
    overdueEom?: number;
    forecast?: number;
    status?: string;
    contacts?: Array<{
      name?: string;
      email?: string | null;
      phone?: string | null;
      role?: string;
    }>;
  };
}

export function CustomerDetailsModal({ open, onOpenChange, group }: CustomerDetailsModalProps) {
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set());
  const [callNotes, setCallNotes] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("friendly");

  // Mock invoice data - in real app, fetch from API
  const invoices = [
    { id: "INV-001", date: "2026-07-15", amount: 5000 },
    { id: "INV-002", date: "2026-07-10", amount: 3500 },
    { id: "INV-003", date: "2026-07-05", amount: 2200 },
  ];

  const toggleInvoice = (id: string) => {
    const newSet = new Set(selectedInvoices);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedInvoices(newSet);
  };

  const toggleContact = (idx: number) => {
    const newSet = new Set(selectedContacts);
    if (newSet.has(idx)) newSet.delete(idx);
    else newSet.add(idx);
    setSelectedContacts(newSet);
  };

  const handleSendEmail = () => {
    if (selectedContacts.size === 0) {
      toast.error("Please select at least one contact");
      return;
    }
    toast.success(`Email sent to ${selectedContacts.size} contact(s)`);
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
              {group.status && (
                <Badge className="bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-50">
                  {group.status}
                </Badge>
              )}
            </div>
            <div className="text-3xl font-bold text-red-600">{fmtEur(group.overdue)}</div>
            <div className="text-sm text-gray-500 mt-1">Total Overdue</div>
          </div>
          <DialogClose className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </DialogClose>
        </div>

        {/* Quick Action Buttons */}
        <div className="px-6 pt-4 pb-4 border-b border-gray-200 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={handleLogCall}
          >
            Log Call
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={handleSendEmail}
          >
            Send Email
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Financials Summary */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Financials</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="border border-gray-200 rounded p-4">
                <div className="text-xs text-gray-500 mb-1">Overdue</div>
                <div className="text-xl font-bold text-red-600">{fmtEur(group.overdue)}</div>
              </div>
              {group.overdueEom && (
                <div className="border border-gray-200 rounded p-4">
                  <div className="text-xs text-gray-500 mb-1">Overdue EOM</div>
                  <div className="text-xl font-bold text-orange-600">{fmtEur(group.overdueEom)}</div>
                </div>
              )}
              {group.forecast && (
                <div className="border border-gray-200 rounded p-4">
                  <div className="text-xs text-gray-500 mb-1">AI Forecast</div>
                  <div className="text-xl font-bold text-green-600">{fmtEur(group.forecast)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Open Invoices */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Open Invoices</h2>
            <div className="border border-gray-200 rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="w-6 px-4 py-3 text-left">
                      <Checkbox
                        checked={selectedInvoices.size === invoices.length}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedInvoices(new Set(invoices.map(i => i.id)));
                          } else {
                            setSelectedInvoices(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Invoice #</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedInvoices.has(inv.id)}
                          onCheckedChange={() => toggleInvoice(inv.id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-900">{inv.id}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtDate(new Date(inv.date).getTime())}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">{fmtEur(inv.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Contacts & Communication */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Contacts & Communication</h2>
            
            {/* Contacts List */}
            <div className="space-y-2">
              {group.contacts && group.contacts.length > 0 ? (
                group.contacts.map((contact, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 border border-gray-200 rounded hover:bg-gray-50">
                    <Checkbox
                      checked={selectedContacts.has(idx)}
                      onCheckedChange={() => toggleContact(idx)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">{contact.name || "Unknown"}</div>
                      {contact.role && <div className="text-xs text-gray-500">{contact.role}</div>}
                      <div className="flex items-center gap-3 mt-1 text-sm">
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
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500 p-3">No contacts available</div>
              )}
            </div>

            {/* Message Template & Send */}
            <div className="space-y-3 pt-3 border-t border-gray-200">
              <Select value={messageTemplate} onValueChange={setMessageTemplate}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">Friendly Reminder</SelectItem>
                  <SelectItem value="final">Final Notice</SelectItem>
                  <SelectItem value="statement">Statement</SelectItem>
                </SelectContent>
              </Select>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleSendEmail}
              >
                Send Email
              </Button>
            </div>
          </div>

          {/* Action & History */}
          <div className="space-y-3 border-t border-gray-200 pt-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Action & History</h2>
            
            {/* Call Notes */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Call Notes</label>
              <Textarea
                placeholder="Enter call notes..."
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                className="text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={handleLogCall}
              >
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePromiseToPay}
                >
                  Record
                </Button>
              </div>
            </div>

            {/* Activity Log */}
            <div className="space-y-2 pt-3">
              <h3 className="text-xs font-semibold text-gray-600 uppercase">Recent Activity</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-3 p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500 whitespace-nowrap">2 hours ago</div>
                  <div className="text-gray-700">Call logged - No answer</div>
                </div>
                <div className="flex items-start gap-3 p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500 whitespace-nowrap">1 day ago</div>
                  <div className="text-gray-700">Email sent - Friendly Reminder</div>
                </div>
                <div className="flex items-start gap-3 p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500 whitespace-nowrap">3 days ago</div>
                  <div className="text-gray-700">Promise recorded - Due 2026-07-28</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
