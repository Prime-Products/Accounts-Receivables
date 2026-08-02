import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { downloadBase64 } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { matchesAllTokens } from "@shared/textMatch";
import { FileDown, Mail, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface SendEmailDialogProps {
  companies: { id: number; name: string; email?: string | null; contactPerson?: string | null }[];
  defaultCustomerId?: number;
  /** When set, the SOA attachment covers the whole group (per-company statements). */
  groupName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * All templates are rendered server-side from the (editable) text stored in
 * Settings → Email Templates, with {{placeholders}} filled from live figures.
 * Only "Custom" is left entirely to the user.
 */
const smartTemplates = [
  "SOA",
  "Payment Reminder",
  "Overdue Notice",
  "Friendly Reminder",
  "Final Notice",
  "Statement",
] as const;
type SmartTemplate = (typeof smartTemplates)[number];

export default function SendEmailDialog({ companies, defaultCustomerId, groupName, open: externalOpen, onOpenChange }: SendEmailDialogProps) {
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
  const [templateType, setTemplateType] = useState<
    "SOA" | "Payment Reminder" | "Overdue Notice" | "Friendly Reminder" | "Final Notice" | "Statement" | "Custom"
  >("SOA");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  // Whether the user has manually edited subject/body since picking a template —
  // if so, we stop auto-overwriting with server prefill.
  const [dirty, setDirty] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactTitle, setNewContactTitle] = useState("");
  /** New contacts default to Person; departments are shared mailboxes. */
  const [newContactType, setNewContactType] = useState<"Person" | "Department">("Person");
  /**
   * Big groups carry dozens of mailboxes; typing a name, a department or part of an
   * address narrows the list instead of forcing the user to scroll the dialog.
   */
  const [contactSearch, setContactSearch] = useState("");

  // Contacts belong to the group, not to a single legal entity, so the picker
  // lists everyone in the group and falls back to the company when the dialog is
  // opened without a group context.
  const { data: groupContacts } = trpc.paymentContacts.listByGroup.useQuery(
    { group: groupName! },
    { enabled: open && !!groupName }
  );
  const { data: companyContacts } = trpc.paymentContacts.list.useQuery(
    { customerId: customerId! },
    { enabled: open && !groupName && !!customerId }
  );
  const paymentContacts = groupName ? groupContacts : companyContacts;

  /**
   * Departments first: when chasing money, the accounts mailbox is usually the
   * right recipient, and the badge keeps it from being mistaken for a person.
   */
  const orderedContacts = useMemo(() => {
    const list = paymentContacts ?? [];
    return [...list].sort((a, b) => {
      const at = (a as { contactType?: string }).contactType === "Department" ? 0 : 1;
      const bt = (b as { contactType?: string }).contactType === "Department" ? 0 : 1;
      if (at !== bt) return at - bt;
      return a.name.localeCompare(b.name);
    });
  }, [paymentContacts]);

  /** The ordered list narrowed by the search box (name, email, title, company). */
  const shownContacts = useMemo(() => {
    if (!contactSearch.trim()) return orderedContacts;
    return orderedContacts.filter(c =>
      matchesAllTokens(contactSearch, [
        c.name,
        c.email,
        (c as { title?: string | null }).title ?? "",
        (c as { customerName?: string | null }).customerName ?? "",
      ]),
    );
  }, [orderedContacts, contactSearch]);

  const isSmart = (smartTemplates as readonly string[]).includes(templateType);
  const { data: prefill, isFetching: prefillLoading } = trpc.calls.emailPrefill.useQuery(
    { customerId: customerId!, template: templateType as SmartTemplate },
    { enabled: open && !!customerId && isSmart }
  );
  // Apply server prefill whenever it arrives (unless the user already edited).
  useEffect(() => {
    if (prefill && isSmart && !dirty) {
      setSubject(prefill.subject);
      setBody(prefill.body);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, templateType, isSmart]);

  // SOA file export (attached manually in Outlook after auto-download).
  const exportSoa = trpc.reports.export.useMutation({
    onError: e => toast.error(`SOA download failed: ${e.message}`),
  });

  const sendEmail = trpc.calls.sendGroupEmail.useMutation({
    onSuccess: () => {
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
    setTemplateType("SOA");
    setSubject("");
    setBody("");
    setDirty(false);
    setContactSearch("");
  };

  const handleTemplateChange = (template: string) => {
    setTemplateType(template as any);
    setDirty(false);
    if ((smartTemplates as readonly string[]).includes(template)) {
      // Server prefill will arrive via the query; clear stale content meanwhile.
      setSubject("");
      setBody("");
    }
  };

  const handleCustomerChange = (id: number) => {
    setCustomerId(id);
    setSelectedContactId(null);
    setDirty(false);
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
      contactType: newContactType,
    });
  };

  const isFormValid = customerId && recipientEmail && subject && body;

  /**
   * Send flow: (1) for SOA — download the statement file so the user can attach
   * it, (2) open Outlook (default mail app) with recipient/subject/body ready,
   * (3) record the email in history + activity log.
   */
  const handleSend = async () => {
    if (!customerId || !recipientEmail || !subject || !body) return;
    if (templateType === "SOA") {
      try {
        // Whole-group statement (per-company, sample layout) when a group is
        // known; otherwise single-customer statement.
        const r = groupName
          ? await exportSoa.mutateAsync({ report: "soa-group", format: "pdf", group: groupName })
          : await exportSoa.mutateAsync({ report: "soa", format: "pdf", customerId });
        downloadBase64(r.filename, r.mimeType, r.base64);
        toast.success("SOA downloaded — attach it in Outlook before sending");
      } catch {
        // toast already shown by onError; continue to open the email anyway
      }
    }
    // Open the default mail client (Outlook) with everything prefilled.
    const mailto = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    toast.success("Opening Outlook…");
    sendEmail.mutate({
      customerId,
      recipientEmail,
      recipientName: recipientName || undefined,
      templateType,
      subject,
      body,
    });
  };

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
      <ResizableDialogContent storageKey="send-email" className="sm:max-w-none w-[42rem] max-w-[95vw] max-h-[90vh] overflow-y-auto">
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
          {(groupName || customerId) && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Contacts{groupName ? ` — ${groupName}` : ""}
                </Label>
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
                  <div className="flex gap-1.5">
                    {(["Person", "Department"] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewContactType(t)}
                        className={`flex-1 rounded border px-2 py-1 text-xs font-medium transition-[transform,background-color] duration-150 active:scale-[0.97] ${
                          newContactType === t
                            ? "border-sky-500 bg-sky-50 text-sky-800"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <Input
                    placeholder={newContactType === "Department" ? "Department name" : "Contact name"}
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

              {/* Search box: always present so the list never has to be scrolled blindly. */}
              {orderedContacts.length > 3 && (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={`Search ${orderedContacts.length} contacts…`}
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                    className="h-8 pl-7 text-sm bg-background"
                  />
                </div>
              )}

              {/* Contacts List — group-wide when a group is in context */}
              {orderedContacts.length > 0 ? (
                shownContacts.length === 0 ? (
                  <div className="text-xs text-muted-foreground p-2">No contact matches “{contactSearch}”</div>
                ) : (
                <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
                  {shownContacts.map(contact => (
                    <button
                      key={contact.id}
                      onClick={() => handleSelectContact(contact.id)}
                      className={`w-full text-left p-2 rounded text-sm transition-colors ${
                        selectedContactId === contact.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="truncate">{contact.name}</span>
                        {(contact as { contactType?: string }).contactType === "Department" && (
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              selectedContactId === contact.id
                                ? "bg-primary-foreground/20 text-primary-foreground"
                                : "bg-violet-100 text-violet-700"
                            }`}
                          >
                            Dept
                          </span>
                        )}
                      </div>
                      <div className="text-xs opacity-75">{contact.email}</div>
                      {contact.title && <div className="text-xs opacity-75">{contact.title}</div>}
                    </button>
                  ))}
                </div>
                )
              ) : (
                <div className="text-xs text-muted-foreground p-2">No payment contacts yet</div>
              )}
            </div>
          )}

          {/* Template Selection */}
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={templateType} onValueChange={handleTemplateChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select template…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SOA">SOA — Statement of Account (with attachment)</SelectItem>
                <SelectItem value="Payment Reminder">Payment Reminder</SelectItem>
                <SelectItem value="Overdue Notice">Overdue Notice</SelectItem>
                <SelectItem value="Friendly Reminder">Friendly Reminder</SelectItem>
                <SelectItem value="Final Notice">Final Notice</SelectItem>
                <SelectItem value="Statement">Statement</SelectItem>
                <SelectItem value="Custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {isSmart && prefillLoading && (
              <div className="text-xs text-muted-foreground">Preparing content from live figures…</div>
            )}
            {isSmart && !prefillLoading && (
              <div className="text-xs text-muted-foreground">
                Wording comes from Settings → Email Templates; figures are filled in automatically.
              </div>
            )}
            {isSmart && prefill && (
              <div className="text-xs text-muted-foreground">
                {prefill.openCount} open invoice{prefill.openCount === 1 ? "" : "s"} · outstanding €
                {prefill.openTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                {prefill.overdueCount > 0 &&
                  ` · overdue €${prefill.overdueTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              </div>
            )}
            {templateType === "SOA" && (
              <div className="text-xs rounded-md border border-blue-200 bg-blue-50 text-blue-900 p-2 flex items-start gap-1.5">
                <FileDown className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  On Send, the SOA (PDF) downloads automatically and Outlook opens with the text ready — just attach
                  the downloaded file and press Send in Outlook.
                </span>
              </div>
            )}
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input
              type="text"
              placeholder="Email subject"
              value={subject}
              onChange={e => {
                setSubject(e.target.value);
                setDirty(true);
              }}
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea
              placeholder="Email body"
              value={body}
              onChange={e => {
                setBody(e.target.value);
                setDirty(true);
              }}
              rows={10}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            className="gap-1.5"
            disabled={!isFormValid || sendEmail.isPending || exportSoa.isPending}
            onClick={handleSend}
          >
            <Mail className="h-4 w-4" />
            {exportSoa.isPending ? "Preparing SOA…" : sendEmail.isPending ? "Opening…" : "Send via Outlook"}
          </Button>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
}
