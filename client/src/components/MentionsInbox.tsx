import MentionText from "@/components/MentionText";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { AtSign } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const SOURCE_LABEL: Record<string, string> = {
  call: "call note",
  collectionNotes: "collection notes",
  groupNote: "group note",
};

/**
 * "@ me" inbox: notes where a colleague named the current user. Mentions are
 * references, not assignments, so this is a read-and-clear list with no due dates
 * and no task creation.
 */
export default function MentionsInbox({ collapsed }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data } = trpc.team.myMentions.useQuery(undefined, { refetchInterval: 120_000 });
  const markRead = trpc.team.markMentionsRead.useMutation({
    onSuccess: () => utils.team.myMentions.invalidate(),
  });

  // Nothing to show for a login that is not linked to a team member.
  if (!data || data.memberId === null) return null;
  const unread = data.unread ?? 0;
  const items = data.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Mentions"
        >
          <span className="relative shrink-0">
            <AtSign className="h-4 w-4 text-muted-foreground" />
            {unread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </span>
          {!collapsed && <span className="truncate text-muted-foreground">Mentions</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Mentions</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => markRead.mutate({})}
              disabled={markRead.isPending}
            >
              Mark all read
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No one has mentioned you yet. Type @ in a note to mention a colleague.
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y">
            {items.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  markRead.mutate({ mentionId: m.id });
                  setOpen(false);
                  setLocation(`/groups/${encodeURIComponent(m.group)}`);
                }}
                className={`block w-full px-3 py-2 text-left transition-colors hover:bg-accent/50 ${
                  m.readAt ? "" : "bg-primary/5"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{m.group}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <MentionText text={m.excerpt} className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground" />
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {m.byName ? `${m.byName} · ` : ""}
                  {SOURCE_LABEL[m.source] ?? m.source}
                </div>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
