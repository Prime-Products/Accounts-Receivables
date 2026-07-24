import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { fmtEur, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Phone, FileText, CheckSquare2, MessageSquare, Send } from "lucide-react";

interface Contact {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}

interface GroupSidePanelProps {
  groupName: string;
  overdue: number;
  forecast: number;
  contacts?: Contact[];
  daysInProblematic?: number;
  paymentTrend?: number;
}

const emailTemplates = [
  {
    id: "friendly",
    label: "Friendly Reminder",
    subject: "Payment Reminder - {company}",
    body: "Dear {contact},\n\nWe hope this message finds you well. We noticed that invoice(s) totaling {amount} are now due. Could you please arrange payment at your earliest convenience?\n\nThank you for your prompt attention to this matter.\n\nBest regards,\nAR Team",
  },
  {
    id: "final",
    label: "Final Notice",
    subject: "Final Notice - Payment Required - {company}",
    body: "Dear {contact},\n\nThis is a final notice regarding outstanding invoice(s) totaling {amount} that are now significantly overdue.\n\nImmediate payment is required to avoid further action.\n\nPlease contact us immediately to arrange payment.\n\nBest regards,\nAR Team",
  },
  {
    id: "statement",
    label: "Statement",
    subject: "Account Statement - {company}",
    body: "Dear {contact},\n\nPlease find attached your account statement as of {date}.\n\nIf you have any questions regarding this statement, please don't hesitate to contact us.\n\nBest regards,\nAR Team",
  },
  {
    id: "custom",
    label: "Custom",
    subject: "",
    body: "",
  },
];

export function GroupSidePanel({
  groupName,
  overdue,
  forecast,
  contacts = [],
  daysInProblematic = 0,
  paymentTrend = 0,
}: GroupSidePanelProps) {
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("friendly");
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [callNotes, setCallNotes] = useState("");
  const [promiseDate, setPromiseDate] = useState("");

  const template = emailTemplates.find((t) => t.id === selectedTemplate);

  const toggleContact = (email: string) => {
    setSelectedContacts((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const handleSendEmail = async () => {
    if (selectedContacts.length === 0) {
      alert("Please select at least one contact");
      return;
    }
    // TODO: Implement email sending
    alert(`Email would be sent to: ${selectedContacts.join(", ")}`);
  };

  const handleLogCall = async () => {
    if (!callNotes.trim()) {
      alert("Please enter call notes");
      return;
    }
    // TODO: Implement call logging
    alert("Call logged: " + callNotes);
    setCallNotes("");
  };

  const handlePromiseToPay = async () => {
    if (!promiseDate) {
      alert("Please select a promise date");
      return;
    }
    // TODO: Implement promise-to-pay
    alert(`Promise to pay recorded for: ${promiseDate}`);
    setPromiseDate("");
  };

  return (
    <div className="w-80 border-l border-gray-200 bg-white p-6 space-y-6 overflow-y-auto">
      {/* Email Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Mail className="h-4 w-4" /> Send Email
        </h3>

        {/* Contact Selection */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Recipients</Label>
          <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 rounded p-2">
            {contacts.length > 0 ? (
              contacts.map((contact) => (
                <div key={contact.email} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedContacts.includes(contact.email || "")}
                    onCheckedChange={() => toggleContact(contact.email || "")}
                  />
                  <div className="text-xs">
                    <div className="font-medium">{contact.name}</div>
                    <div className="text-muted-foreground">{contact.role}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground">No contacts available</div>
            )}
          </div>
        </div>

        {/* Template Selection */}
        <div className="space-y-2">
          <Label htmlFor="template" className="text-xs font-medium">
            Template
          </Label>
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger id="template" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {emailTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom Template Fields */}
        {selectedTemplate === "custom" && (
          <>
            <input
              type="text"
              placeholder="Subject"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded px-2 py-1"
            />
            <Textarea
              placeholder="Message body"
              value={customBody}
              onChange={(e) => setCustomBody(e.target.value)}
              className="w-full text-xs h-20"
            />
          </>
        )}

        {/* Send Button */}
        <Button
          onClick={handleSendEmail}
          size="sm"
          className="w-full text-xs"
          disabled={selectedContacts.length === 0}
        >
          <Send className="h-3 w-3 mr-1" /> Send Email
        </Button>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200" />

      {/* Actions Hub */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Actions</h3>

        {/* Log Call */}
        <div className="space-y-2">
          <Label htmlFor="call-notes" className="text-xs font-medium">
            Log Call
          </Label>
          <Textarea
            id="call-notes"
            placeholder="Call notes..."
            value={callNotes}
            onChange={(e) => setCallNotes(e.target.value)}
            className="w-full text-xs h-16"
          />
          <Button onClick={handleLogCall} size="sm" variant="outline" className="w-full text-xs">
            <Phone className="h-3 w-3 mr-1" /> Log Call
          </Button>
        </div>

        {/* Create Task */}
        <Button size="sm" variant="outline" className="w-full text-xs">
          <CheckSquare2 className="h-3 w-3 mr-1" /> Create Task
        </Button>

        {/* Promise to Pay */}
        <div className="space-y-2">
          <Label htmlFor="promise-date" className="text-xs font-medium">
            Promise to Pay
          </Label>
          <input
            id="promise-date"
            type="date"
            value={promiseDate}
            onChange={(e) => setPromiseDate(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1"
          />
          <Button onClick={handlePromiseToPay} size="sm" variant="outline" className="w-full text-xs">
            <FileText className="h-3 w-3 mr-1" /> Record Promise
          </Button>
        </div>

        {/* Add Note */}
        <Button size="sm" variant="outline" className="w-full text-xs">
          <MessageSquare className="h-3 w-3 mr-1" /> Add Note
        </Button>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200" />

      {/* AI Summary */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Summary</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Overdue:</span>
            <span className="font-bold text-red-600">{fmtEur(overdue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Forecast:</span>
            <span className="font-bold text-green-600">{fmtEur(forecast)}</span>
          </div>
          {daysInProblematic > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Days Problematic:</span>
              <span className="font-bold text-amber-600">{daysInProblematic} days</span>
            </div>
          )}
          {paymentTrend !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Trend:</span>
              <span className={`font-bold ${paymentTrend >= 0 ? "text-green-600" : "text-red-600"}`}>
                {paymentTrend >= 0 ? "+" : ""}{paymentTrend}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200" />

      {/* Activity Log */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Activity Log</h3>
        <div className="space-y-2 text-xs max-h-48 overflow-y-auto">
          <div className="flex gap-2 pb-2 border-b border-gray-100">
            <div className="text-muted-foreground min-w-fit">2026-07-24 14:30</div>
            <div>
              <span className="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-medium mr-1">
                Call
              </span>
              Spoke with CFO regarding payment
            </div>
          </div>
          <div className="flex gap-2 pb-2 border-b border-gray-100">
            <div className="text-muted-foreground min-w-fit">2026-07-23 10:15</div>
            <div>
              <span className="inline-block bg-green-50 text-green-700 px-2 py-0.5 rounded text-[10px] font-medium mr-1">
                Email
              </span>
              Sent Final Notice
            </div>
          </div>
          <div className="flex gap-2 pb-2 border-b border-gray-100">
            <div className="text-muted-foreground min-w-fit">2026-07-20 16:45</div>
            <div>
              <span className="inline-block bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-[10px] font-medium mr-1">
                Task
              </span>
              Follow-up scheduled
            </div>
          </div>
          <div className="flex gap-2 pb-2">
            <div className="text-muted-foreground min-w-fit">2026-07-18 09:00</div>
            <div>
              <span className="inline-block bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-[10px] font-medium mr-1">
                Promise
              </span>
              Payment promised by 2026-07-25
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
