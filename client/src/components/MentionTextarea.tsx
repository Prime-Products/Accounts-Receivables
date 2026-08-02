import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { buildMentionToken, findActiveMentionQuery } from "@shared/mentions";
import { AtSign } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Note field with `@` autocomplete over our own team members.
 *
 * Typing `@` opens a short list of colleagues; picking one inserts a marker that
 * keeps the readable name but also stores the member id, so a later rename does not
 * orphan the reference. A mention is only a reference — it never creates a task.
 */
export default function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength,
  autoFocus,
  className,
  disabled,
  hint = true,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  /** Show the "@ to mention a colleague" helper line under the field. */
  hint?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { data: members } = trpc.team.list.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    if (!mention || !members) return [];
    const q = mention.query.trim().toLowerCase();
    const pool = members.filter(m => m.name?.trim());
    const scored = q
      ? pool.filter(m => {
          const hay = `${m.name} ${m.title ?? ""} ${m.email ?? ""}`.toLowerCase();
          return q.split(/\s+/).every(t => hay.includes(t));
        })
      : pool;
    return scored.slice(0, 6);
  }, [mention, members]);

  // Keep the highlighted row valid as the query narrows the list.
  useEffect(() => {
    setHighlight(0);
  }, [mention?.query]);

  function syncMentionState(text: string, caret: number) {
    setMention(findActiveMentionQuery(text, caret));
  }

  function insert(member: { id: number; name: string }) {
    if (!mention) return;
    const el = ref.current;
    const caret = el ? el.selectionStart : value.length;
    const token = buildMentionToken(member);
    const next = `${value.slice(0, mention.start)}${token} ${value.slice(caret)}`;
    onChange(next);
    setMention(null);
    // Put the caret right after the inserted name so typing continues naturally.
    const pos = mention.start + token.length + 1;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  const open = mention !== null && matches.length > 0;

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        rows={rows}
        maxLength={maxLength}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        onChange={e => {
          onChange(e.target.value);
          syncMentionState(e.target.value, e.target.selectionStart);
        }}
        onClick={e => syncMentionState(value, (e.target as HTMLTextAreaElement).selectionStart)}
        onKeyDown={e => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight(h => (h + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight(h => (h - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insert(matches[highlight]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setMention(null);
          }
        }}
        onBlur={() => {
          // Delay so a click on the list still registers.
          setTimeout(() => setMention(null), 120);
        }}
      />
      {open && (
        <div className="absolute left-2 right-2 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Mention a colleague</div>
          {matches.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => insert(m)}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors",
                i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
              )}
            >
              <span className="font-medium">{m.name}</span>
              {m.title && <span className="text-xs text-muted-foreground truncate">{m.title}</span>}
            </button>
          ))}
        </div>
      )}
      {hint && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <AtSign className="h-3 w-3" />
          Type @ to mention a colleague — they are notified, no task is created
        </div>
      )}
    </div>
  );
}
