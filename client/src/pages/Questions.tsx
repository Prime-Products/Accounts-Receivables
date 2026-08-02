import { useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, HelpCircle, Layers, Send } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  Open: "bg-amber-50 text-amber-700 border-amber-200",
  Answered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Closed: "bg-gray-100 text-gray-600 border-gray-200",
};

function when(ts: Date | number | string | null | undefined): string {
  if (!ts) return "";
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** One question card, with the reply box for the colleague who has to answer. */
function QuestionRow({ q, onDone }: { q: any; onDone: () => void }) {
  const [draft, setDraft] = useState("");
  const [replying, setReplying] = useState(false);
  const answer = trpc.questions.answer.useMutation({
    onSuccess: () => {
      toast.success("Answer sent");
      setDraft("");
      setReplying(false);
      onDone();
    },
    onError: e => toast.error(e.message),
  });
  const close = trpc.questions.close.useMutation({
    onSuccess: () => {
      toast.success("Question closed");
      onDone();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/groups/${encodeURIComponent(q.group)}`}
              className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
            >
              <Layers className="h-3.5 w-3.5 text-muted-foreground" /> {q.group}
            </Link>
            {q.companyName && <span className="text-xs text-muted-foreground truncate">{q.companyName}</span>}
            <Badge variant="outline" className={STATUS_COLORS[q.status] ?? ""}>
              {q.status}
            </Badge>
            {q.department && (
              <Badge variant="outline" className="text-[10px]">
                {q.department}
              </Badge>
            )}
            {q.invoiceIds.length > 0 && (
              <span className="text-xs text-muted-foreground">{q.invoiceIds.length} invoice(s) attached</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {q.askedByMe ? "You asked" : `${q.askedByName ?? "Someone"} asked`}
            {q.askedToMe ? " you" : q.askedToName ? ` ${q.askedToName}` : ""} · {when(q.createdAt)}
          </p>
        </div>
      </div>

      <p className="text-sm whitespace-pre-wrap">{q.question}</p>

      {q.answer && (
        <div className="rounded-md bg-emerald-50/60 border border-emerald-200 p-3">
          <p className="text-xs font-medium text-emerald-800">
            {q.answeredByName ?? "Answer"} · {when(q.answeredAt)}
          </p>
          <p className="text-sm mt-1 whitespace-pre-wrap">{q.answer}</p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {q.status !== "Closed" && !replying && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setReplying(true)}>
            <Send className="h-3.5 w-3.5" /> {q.answer ? "Add another answer" : "Answer"}
          </Button>
        )}
        {q.askedByMe && q.status !== "Closed" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-muted-foreground"
            disabled={close.isPending}
            onClick={() => close.mutate({ id: q.id })}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Resolved — close
          </Button>
        )}
      </div>

      {replying && (
        <div className="space-y-2">
          <Textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Your answer…"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!draft.trim() || answer.isPending}
              onClick={() => answer.mutate({ id: q.id, answer: draft.trim() })}
            >
              {answer.isPending ? "Sending…" : "Send answer"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Questions inbox — the two sides of an internal question: what colleagues need
 * from me, and what I am still waiting for. Deliberately separate from Tasks:
 * questions have no due date and are closed by an answer, not by work.
 */
export default function Questions() {
  const [box, setBox] = useState<"toMe" | "fromMe">("toMe");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.questions.list.useQuery({ box });
  const refresh = () => {
    utils.questions.list.invalidate();
    utils.questions.badges.invalidate();
  };

  const items = (data?.items ?? []) as any[];
  const open = items.filter(q => q.status !== "Closed");
  const closed = items.filter(q => q.status === "Closed");

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-amber-600" /> Questions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Internal questions about customers. No due dates — a question stays open until it is answered.
        </p>
      </div>

      <Tabs value={box} onValueChange={v => setBox(v as any)}>
        <TabsList>
          <TabsTrigger value="toMe">To answer</TabsTrigger>
          <TabsTrigger value="fromMe">I asked</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {box === "toMe" ? "Waiting for your answer" : "Waiting for an answer"}
            {open.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{open.length}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </>
          ) : data && data.memberId === null && box === "toMe" ? (
            <p className="text-sm text-muted-foreground py-4">
              Your login is not linked to a team member yet, so questions cannot be addressed to you. Link it on the Team
              page.
            </p>
          ) : open.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {box === "toMe"
                ? "Nothing to answer. Questions colleagues send you will appear here."
                : "You have no open questions. Use “Ask a colleague” on a customer card."}
            </p>
          ) : (
            open.map(q => <QuestionRow key={q.id} q={q} onDone={refresh} />)
          )}
        </CardContent>
      </Card>

      {closed.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground">Closed · {closed.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {closed.map(q => (
              <QuestionRow key={q.id} q={q} onDone={refresh} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
