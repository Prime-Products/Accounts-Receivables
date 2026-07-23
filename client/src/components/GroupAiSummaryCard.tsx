import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** AI summary card for a customer group, shared by the group card and the customer card. */
export default function GroupAiSummaryCard({ group }: { group: string }) {
  const [summary, setSummary] = useState<{ text: string; at: number } | null>(null);
  const gen = trpc.customers.groupAiSummary.useMutation({
    onSuccess: r => setSummary({ text: r.summary, at: r.generatedAt }),
    onError: e => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> AI Summary
        </CardTitle>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={gen.isPending} onClick={() => gen.mutate({ group })}>
          {gen.isPending ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {gen.isPending ? "Analyzing…" : summary ? "Regenerate" : "Generate Summary"}
        </Button>
      </CardHeader>
      <CardContent>
        {gen.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : summary ? (
          <div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{summary.text}</div>
            <p className="text-[11px] text-muted-foreground mt-2">Generated {new Date(summary.at).toLocaleString()}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Generate an AI snapshot of this group: exposure, overdue risk, payment behavior, promises, open tasks and notes — useful before a
            collection call.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

