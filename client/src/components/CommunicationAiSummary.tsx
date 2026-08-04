import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";
import { ChevronDown, ChevronUp, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Minimal markdown for the summary text: the model answers with **bold** leads
 * and "- " bullets, nothing else. A full markdown renderer would be a dependency
 * for two constructs, so they are handled here.
 */
function renderLine(text: string, key: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <span key={key}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

function SummaryText({ text }: { text: string }) {
  const lines = text.split("\n").map(l => l.trim());
  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
      {lines.map((line, i) => {
        if (!line) return null;
        const bullet = line.startsWith("- ") || line.startsWith("• ");
        return bullet ? (
          <div key={i} className="flex gap-1.5">
            <span className="shrink-0 text-primary">•</span>
            <span>{renderLine(line.slice(2), `b${i}`)}</span>
          </div>
        ) : (
          <p key={i}>{renderLine(line, `l${i}`)}</p>
        );
      })}
    </div>
  );
}

interface Props {
  /** Collections group whose recent history is summarised. */
  group: string;
  /** Size of the look-back window in days. */
  days?: number;
}

/**
 * "AI summary" for the Communication window: reads what happened in the last
 * `days` (calls, promises, emails, notes, tasks, money received) and answers in
 * a few Greek lines ending with the next concrete step.
 *
 * It lives inside the window instead of a separate dialog, so the collector can
 * read the recap and the underlying entries at the same time.
 */
export function CommunicationAiSummary({ group, days = 30 }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const gen = trpc.customers.communicationSummary.useMutation({
    onSuccess: r => {
      setText(r.summary);
      setAt(r.generatedAt);
      setCollapsed(false);
    },
    onError: e => toast.error(e.message),
  });

  if (!text) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0 gap-1.5 bg-background text-xs"
        disabled={gen.isPending || !group}
        onClick={() => gen.mutate({ group, days })}
        title={`Σύνοψη των τελευταίων ${days} ημερών με προτεινόμενο επόμενο βήμα`}
      >
        {gen.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
        {gen.isPending ? "Ανάλυση…" : "AI σύνοψη"}
      </Button>
    );
  }

  return (
    <div className="w-full rounded-md border border-primary/20 bg-primary/5 p-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 text-left"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? "Εμφάνιση σύνοψης" : "Σύμπτυξη"}
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-xs font-semibold">Τελευταίες {days} ημέρες</span>
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            disabled={gen.isPending}
            onClick={() => gen.mutate({ group, days })}
            title="Ανανέωση σύνοψης"
          >
            {gen.isPending ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => {
              setText(null);
              setAt(null);
            }}
            title="Κλείσιμο σύνοψης"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div className="mt-1.5">
          <SummaryText text={text} />
          {at && (
            <p className="mt-1.5 text-[10px] text-muted-foreground/80">
              Δημιουργήθηκε {new Date(at).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
