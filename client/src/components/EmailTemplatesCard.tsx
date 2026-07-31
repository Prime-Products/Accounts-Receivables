import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Eye, Mail, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Settings → Email Templates.
 *
 * Lets the user edit the subject/body of every email template used by the Send
 * Email dialog. Text may contain {{placeholders}} that are substituted with the
 * customer's live figures. "Reset to default" drops the stored override.
 */
export default function EmailTemplatesCard() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.emailTemplates.useQuery();
  const [active, setActive] = useState<string>("SOA");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  // Textarea does not forward refs, so we grab the DOM node from a wrapper.
  const bodyWrapRef = useRef<HTMLDivElement | null>(null);
  const getBodyEl = () => bodyWrapRef.current?.querySelector("textarea") ?? null;

  const current = data?.templates.find(t => t.templateType === active);

  // Load the selected template into the editor (once per template, so typing is not lost).
  useEffect(() => {
    if (current && loadedKey !== active) {
      setSubject(current.subject);
      setBody(current.body);
      setLoadedKey(active);
      setPreview(false);
    }
  }, [current, active, loadedKey]);

  const save = trpc.admin.saveEmailTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template saved — it will be used the next time you send an email");
      utils.admin.emailTemplates.invalidate();
      utils.calls.emailPrefill.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const reset = trpc.admin.resetEmailTemplate.useMutation({
    onSuccess: r => {
      toast.success("Default text restored");
      setSubject(r.subject);
      setBody(r.body);
      utils.admin.emailTemplates.invalidate();
      utils.calls.emailPrefill.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const { data: previewData, isFetching: previewLoading } = trpc.admin.previewEmailTemplate.useQuery(
    { subject, body },
    { enabled: preview && subject.length > 0 },
  );

  const dirty = !!current && (subject !== current.subject || body !== current.body);

  /** Insert a placeholder at the caret position of the body textarea. */
  const insertPlaceholder = (key: string) => {
    const token = `{{${key}}}`;
    const el = getBodyEl();
    if (!el) {
      setBody(b => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const unknownPlaceholders = useMemo(() => {
    if (!data) return [];
    const known = new Set(data.placeholders.map(p => p.key));
    const found: string[] = [];
    const re = /\{\{\s*(\w+)\s*\}\}/g;
    const text = `${subject}\n${body}`;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (!known.has(m[1]) && found.indexOf(m[1]) === -1) found.push(m[1]);
    }
    return found;
  }, [subject, body, data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" /> Email Templates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Edit the text used by the Send Email dialog. Placeholders in double braces are replaced with the customer's
          live figures when the email is prepared, so the wording stays yours while the numbers stay current.
        </p>

        {isLoading || !data ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            <Tabs value={active} onValueChange={setActive}>
              <TabsList className="h-auto flex-wrap">
                {data.templates.map(t => (
                  <TabsTrigger key={t.templateType} value={t.templateType} className="gap-1.5">
                    {t.templateType}
                    {t.isCustom && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Customised" />}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Subject</Label>
                  <Input value={subject} onChange={e => setSubject(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Body</Label>
                    {current && (
                      <span className="text-xs text-muted-foreground">
                        {current.isCustom ? "Customised" : "Default text"}
                      </span>
                    )}
                  </div>
                  <div ref={bodyWrapRef}>
                    <Textarea
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      rows={16}
                      className="font-mono text-[13px] leading-relaxed"
                    />
                  </div>
                </div>

                {unknownPlaceholders.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    Unknown placeholder{unknownPlaceholders.length === 1 ? "" : "s"}:{" "}
                    <span className="font-mono">{unknownPlaceholders.map(p => `{{${p}}}`).join(", ")}</span> — these will
                    be left in the email as-is. Check the list on the right.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    className="gap-1.5"
                    disabled={!dirty || !subject.trim() || !body.trim() || save.isPending}
                    onClick={() => save.mutate({ templateType: active as any, subject, body })}
                  >
                    <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save Template"}
                  </Button>
                  <Button variant="outline" className="gap-1.5" onClick={() => setPreview(p => !p)}>
                    <Eye className="h-4 w-4" /> {preview ? "Hide Preview" : "Preview"}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    disabled={reset.isPending || (!current?.isCustom && !dirty)}
                    onClick={() => {
                      if (current?.isCustom) {
                        reset.mutate({ templateType: active as any });
                      } else if (current) {
                        setSubject(current.defaultSubject);
                        setBody(current.defaultBody);
                      }
                    }}
                  >
                    <RotateCcw className="h-4 w-4" /> Reset to default
                  </Button>
                  {dirty && <span className="text-xs text-amber-600 self-center">Unsaved changes</span>}
                </div>

                {preview && (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      Preview with example values{previewLoading ? " — rendering…" : ""}
                    </div>
                    <div className="text-sm font-semibold">{previewData?.subject ?? subject}</div>
                    <pre className="text-[13px] whitespace-pre-wrap font-sans leading-relaxed">
                      {previewData?.body ?? body}
                    </pre>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Placeholders</Label>
                <p className="text-xs text-muted-foreground">Click one to insert it at the cursor.</p>
                <div className="space-y-1.5 max-h-96 overflow-auto pr-1">
                  {data.placeholders.map(p => (
                    <button
                      key={p.key}
                      onClick={() => insertPlaceholder(p.key)}
                      className="w-full rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                    >
                      <Badge variant="outline" className="font-mono text-[11px]">{`{{${p.key}}}`}</Badge>
                      <div className="text-[11px] text-muted-foreground mt-1">{p.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
