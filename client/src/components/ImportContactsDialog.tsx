/**
 * Three-step Excel import for contacts: pick a file, map the sheet columns onto
 * AR Pro fields (including custom fields), then review the create/update/skip
 * plan before anything is written. Nothing touches the database until the user
 * confirms the plan.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Check, FileUp, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const IGNORE = "__ignore__";

type Step = "file" | "map" | "review";

export function ImportContactsDialog({ onImported }: { onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("file");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: fieldDefs } = trpc.addressBook.fields.useQuery({ entity: "contact" });

  const targets = [
    { key: "name", label: "Name", required: true },
    { key: "email", label: "Email", required: true },
    { key: "phone", label: "Phone", required: false },
    { key: "title", label: "Position", required: false },
    { key: "companyCode", label: "Company code (ERP)", required: false },
    { key: "companyName", label: "Company name", required: false },
    ...(fieldDefs ?? []).map(f => ({ key: `custom:${f.fieldKey}`, label: `${f.label} (custom)`, required: false })),
  ];

  const reset = () => {
    setStep("file");
    setFileName("");
    setFileBase64("");
    setHeaders([]);
    setSample([]);
    setMapping({});
    setSkipped([]);
  };

  const inspect = trpc.addressBook.importInspect.useMutation({
    onSuccess: res => {
      setHeaders(res.headers);
      setSample(res.sample as Record<string, string>[]);
      // Pre-map obvious headers so the common case is one click.
      const guess: Record<string, string> = {};
      for (const h of res.headers) {
        const l = h.toLowerCase();
        if (/e-?mail/.test(l)) guess[h] = "email";
        else if (/phone|tel|mobile/.test(l)) guess[h] = "phone";
        else if (/position|title|role/.test(l)) guess[h] = "title";
        else if (/code|erp/.test(l)) guess[h] = "companyCode";
        else if (/company|customer|client/.test(l)) guess[h] = "companyName";
        else if (/name|contact|person/.test(l) && !guess[h]) guess[h] = "name";
      }
      setMapping(guess);
      setStep("map");
    },
    onError: e => toast.error(e.message),
  });

  const preview = trpc.addressBook.importPreview.useMutation({
    onSuccess: () => setStep("review"),
    onError: e => toast.error(e.message),
  });

  const utils = trpc.useUtils();
  const apply = trpc.addressBook.importApply.useMutation({
    onSuccess: res => {
      toast.success(`Imported — ${res.created} created, ${res.updated} updated`);
      utils.addressBook.contacts.invalidate();
      utils.addressBook.counts.invalidate();
      utils.addressBook.quality.invalidate();
      utils.paymentContacts.invalidate();
      setOpen(false);
      reset();
      onImported?.();
    },
    onError: e => toast.error(e.message),
  });

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] ?? "";
      setFileName(file.name);
      setFileBase64(base64);
      inspect.mutate({ fileBase64: base64 });
    };
    reader.readAsDataURL(file);
  };

  const mappedTargets = new Set(Object.values(mapping).filter(v => v && v !== IGNORE));
  const canPreview = mappedTargets.has("name") && mappedTargets.has("email");
  const plan = preview.data;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Import
      </Button>

      <Dialog
        open={open}
        onOpenChange={o => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Import contacts from Excel
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {step === "file" ? "Step 1 of 3 — file" : step === "map" ? "Step 2 of 3 — map columns" : "Step 3 of 3 — review"}
              </span>
            </DialogTitle>
          </DialogHeader>

          {step === "file" && (
            <div className="space-y-3">
              <button
                className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground transition-colors hover:bg-accent/40"
                onClick={() => inputRef.current?.click()}
              >
                <FileUp className="h-8 w-8" />
                {inspect.isPending ? "Reading the sheet…" : "Click to choose an .xlsx file"}
                {fileName && <span className="text-xs">{fileName}</span>}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = "";
                }}
              />
              <p className="text-xs text-muted-foreground">
                The first row is treated as the header. Contacts are matched on email; a company code or company name is
                needed to create new contacts.
              </p>
            </div>
          )}

          {step === "map" && (
            <div className="space-y-3">
              <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
                {headers.map(h => (
                  <div key={h} className="flex items-center gap-3 rounded-md border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <Label className="block truncate text-sm">{h}</Label>
                      <span className="block truncate text-xs text-muted-foreground">
                        {sample.map(s => s[h]).filter(Boolean).slice(0, 3).join(" · ") || "no sample values"}
                      </span>
                    </div>
                    <Select
                      value={mapping[h] ?? IGNORE}
                      onValueChange={v => setMapping(m => ({ ...m, [h]: v === IGNORE ? "" : v }))}
                    >
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="Ignore" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value={IGNORE}>Ignore this column</SelectItem>
                        {targets.map(t => (
                          <SelectItem key={t.key} value={t.key}>
                            {t.label}
                            {t.required ? " *" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {!canPreview && (
                <p className="text-xs text-amber-600">Map at least Name and Email to continue.</p>
              )}
            </div>
          )}

          {step === "review" && plan && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline" className="gap-1">
                  {plan.summary.create} to create
                </Badge>
                <Badge variant="outline" className="gap-1">
                  {plan.summary.update} to update
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  {plan.summary.skip} skipped
                </Badge>
              </div>
              <div className="max-h-[50vh] overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-xs">
                    <tr>
                      <th className="w-10 px-2 py-1.5" />
                      <th className="px-2 py-1.5 text-left">Contact</th>
                      <th className="px-2 py-1.5 text-left">Company</th>
                      <th className="px-2 py-1.5 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {plan.rows.slice(0, 300).map(r => {
                      const isSkip = r.action === "skip" || skipped.includes(r.rowIndex);
                      return (
                        <tr key={r.rowIndex} className={isSkip ? "text-muted-foreground" : ""}>
                          <td className="px-2 py-1.5 text-center">
                            {r.action !== "skip" && (
                              <input
                                type="checkbox"
                                checked={!skipped.includes(r.rowIndex)}
                                onChange={e =>
                                  setSkipped(s =>
                                    e.target.checked ? s.filter(i => i !== r.rowIndex) : [...s, r.rowIndex],
                                  )
                                }
                              />
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="block truncate">{r.values.name || "—"}</span>
                            <span className="block truncate text-xs text-muted-foreground">{r.values.email || "no email"}</span>
                          </td>
                          <td className="px-2 py-1.5 truncate">{r.companyLabel}</td>
                          <td className="px-2 py-1.5">
                            <span
                              className={
                                r.action === "create"
                                  ? "text-emerald-600"
                                  : r.action === "update"
                                    ? "text-blue-600"
                                    : "text-muted-foreground"
                              }
                            >
                              {r.action === "create" ? "Create" : r.action === "update" ? "Update" : "Skip"}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {r.action === "update" && r.changes.length > 0
                                ? r.changes.map(c => c.field).join(", ")
                                : r.reason}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {plan.rows.length > 300 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Showing the first 300 of {plan.rows.length} rows — all rows will be imported.
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            {step === "map" && (
              <>
                <Button variant="outline" onClick={() => setStep("file")}>
                  Back
                </Button>
                <Button
                  disabled={!canPreview || preview.isPending}
                  onClick={() => preview.mutate({ fileBase64, mapping })}
                >
                  {preview.isPending ? "Checking…" : "Preview import"}
                </Button>
              </>
            )}
            {step === "review" && (
              <>
                <Button variant="outline" onClick={() => setStep("map")}>
                  Back
                </Button>
                <Button
                  className="gap-1.5"
                  disabled={apply.isPending}
                  onClick={() => apply.mutate({ fileBase64, mapping, skipRowIndexes: skipped })}
                >
                  <Check className="h-4 w-4" />
                  {apply.isPending ? "Importing…" : "Import"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
