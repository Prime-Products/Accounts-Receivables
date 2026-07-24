import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Mail, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface SendEmailDialogProps {
  companies: { id: number; name: string; email?: string | null; contactPerson?: string | null }[];
  defaultCustomerId?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const emailTemplates = {
  "Friendly Reminder": {
    subject: "Payment Reminder - Invoice Outstanding",
    body: "Dear Valued Customer,\n\nWe hope this message finds you well. We noticed that you have an outstanding invoice with us.\n\nPlease arrange payment at your earliest convenience. If you have already processed this payment, please disregard this message.\n\nShould you have any questions, please don't hesitate to contact us.\n\nBest regards",
  },
  "Final Notice": {
    subject: "Final Notice - Urgent Payment Required",
    body: "Dear Valued Customer,\n\nThis is a final notice regarding your overdue invoice. Immediate payment is required to avoid further action.\n\nPlease remit payment immediately. If payment has already been made, please provide proof of payment.\n\nFor urgent matters, please contact our accounting department directly.\n\nBest regards",
  },
  Statement: {
    subject: "Your Account Statement",
    body: "Dear Valued Customer,\n\nPlease find attached your account statement for your review.\n\nIf you have any questions regarding the items listed, please contact us promptly.\n\nThank you for your business.\n\nBest regards",
  },
};

export default function SendEmailDialog({ companies, defaultCustomerId, open: externalOpen, onOpenChange }: SendEmailDialogProps) {
  const utils = trpc.useUtils();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (newOpen: boolean) => {
    if (externalOpen !== undefined) {
      onOpenChange?.(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  };
  const [customerId, setCustomerId] = useState<number | null>(defaultCustomerId ?? null);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [templateType, setTemplateType] = useState<"Friendly Reminder" | "Final Notice" | "Statement" | "Custom">(
    "Friendly Reminder"
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactTitle, setNewContactTitle] = useState("");

  const { data: paymentContacts } = trpc.paymentContacts.list.useQuery(
    { customerId: customerId! },
    { enabled: !!customerId }
  );

  const sendEmail = trpc.calls.sendGroupEmail.useMutation({
    onSuccess: () => {
      toast.success("Email sent successfully");
      utils.calls.invalidate();
      setOpen(false);
      resetForm();
    },
    onError: e => toast.error(e.message),
  });

  const addPaymentContact = trpc.paymentContacts.add.useMutation({
    onSuccess: () => {
      toast.success("Payment contact added");
      utils.paymentContacts.invalidate();
      setAddingContact(false);
      setNewContactName("");
      setNewContactEmail("");
      setNewContactPhone("");
      setNewContactTitle("");
    },
    onError: e => toast.error(e.message),
  });

  const resetForm = () => {
    setCustomerId(defaultCustomerId ?? null);
    setSelectedContactId(null);
    setRecipientEmail("");
    setRecipientName("");
    setTemplateType("Friendly Reminder");
    setSubject("");
    setBody("");
  };

  const handleTemplateChange = (template: string) => {
    setTemplateType(template as any);
    if (template !== "Custom") {
      const t = emailTemplates[template as keyof typeof emailTemplates];
      setSubject(t.subject);
      setBody(t.body);
    }
  };

  const handleCustomerChange = (id: number) => {
    setCustomerId(id);
    setSelectedContactId(null);
    const company = companies.find(c => c.id === id);
    if (company) {
      setRecipientEmail(company.email || "");
      setRecipientName(company.contactPerson || company.name);
    }
  };

  const handleSelectContact = (contactId: number) => {
    const contact = paymentContacts?.find(c => c.id === contactId);
    if (contact) {
      setSelectedContactId(contactId);
      setRecipientEmail(contact.email);
      setRecipientName(contact.name);
    }
  };

  const handleAddContact = () => {
    if (!customerId || !newContactName || !newContactEmail) {
      toast.error("Please fill in required fields (name and email)");
      return;
    }
    addPaymentContact.mutate({
      customerId,
      name: newContactName,
      email: newContactEmail,
      phone: newContactPhone || undefined,
      title: newContactTitle || undefined,
    });
  };

  const isFormValid = customerId && recipientEmail && subject && body;

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (!o) resetForm();
      }}
    >
      {externalOpen === undefined && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Mail className="h-4 w-4" /> Send Email
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Email to Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Company Selection */}
          <div className="space-y-1.5">
            <Label>Company</Label>
            <Select value={customerId ? String(customerId) : ""} onValueChange={v => handleCustomerChange(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select company…" />
              </SelectTrigger>
              <SelectContent>
                {companies.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Contacts Section */}
          {customerId && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Payment Contacts</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1"
                  onClick={() => setAddingContact(!addingContact)}
                >
                  <Plus className="h-3 w-3" /> Add Contact
                </Button>
              </div>

              {/* Add Contact Form */}
              {addingContact && (
                <div className="space-y-2 p-2 bg-background rounded border">
                  <Input
                    placeholder="Contact name"
                    value={newContactName}
                    onChange={e => setNewContactName(e.target.value)}
                    className="text-sm"
                  />
                  <Input
                    type="email"
                    placeholder="Email"
                    value={newContactEmail}
                    onChange={e => setNewContactEmail(e.target.value)}
                    className="text-sm"
                  />
                  <Input
                    placeholder="Phone (optional)"
                    value={newContactPhone}
                    onChange={e => setNewContactPhone(e.target.value)}
                    className="text-sm"
                  />
                  <Input
                    placeholder="Title (optional)"
                    value={newContactTitle}
                    onChange={e => setNewContactTitle(e.target.value)}
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleAddContact}
                      disabled={addPaymentContact.isPending}
                      className="text-xs"
                    >
                      {addPaymentContact.isPending ? "Adding…" : "Add"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAddingContact(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Contacts List */}
              {paymentContacts && paymentContacts.length > 0 ? (
                <div className="space-y-1">
                  {paymentContacts.map(contact => (
                    <button
                      key={contact.id}
                      onClick={() => handleSelectContact(contact.id)}
                      className={`w-full text-left p-2 rounded text-sm transition-colors ${
                        selectedContactId === contact.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      <div className="font-medium">{contact.name}</div>
                      <div className="text-xs opacity-75">{contact.email}</div>
                      {contact.title && <div className="text-xs opacity-75">{contact.title}</div>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground p-2">No payment contacts yet</div>
              )}
            </div>
          )}

          {/* Recipient Email */}
          <div className="space-y-1.5">
            <Label>Recipient Email</Label>
            <Input
              type="email"
              placeholder="email@example.com"
              value={recipientEmail}
              onChange={e => setRecipientEmail(e.target.value)}
            />
          </div>

          {/* Recipient Name */}
          <div className="space-y-1.5">
            <Label>Recipient Name (optional)</Label>
            <Input
              type="text"
              placeholder="Contact person name"
              value={recipientName}
              onChange={e => setRecipientName(e.target.value)}
            />
          </div>

          {/* Template Selection */}
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={templateType} onValueChange={handleTemplateChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select template…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Friendly Reminder">Friendly Reminder</SelectItem>
                <SelectItem value="Final Notice">Final Notice</SelectItem>
                <SelectItem value="Statement">Statement</SelectItem>
                <SelectItem value="Custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input
              type="text"
              placeholder="Email subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea
              placeholder="Email body"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={6}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!isFormValid || sendEmail.isPending} onClick={() => {
            if (customerId && recipientEmail && subject && body) {
              sendEmail.mutate({
                customerId,
                recipientEmail,
                recipientName: recipientName || undefined,
                templateType,
                subject,
                body,
              });
            }
          }}>
            {sendEmail.isPending ? "Sending…" : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
