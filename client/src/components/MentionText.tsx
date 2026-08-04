import { splitMentionSegments } from "@shared/mentions";
import { cn } from "@/lib/utils";

/**
 * Render a note with its @mentions highlighted, without injecting raw HTML.
 * Falls back to plain text when the note has no mention markers.
 */
export default function MentionText({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  const segments = splitMentionSegments(text);
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {segments.map((s, i) =>
        s.type === "mention" ? (
          <span
            key={i}
            className="rounded bg-primary/10 px-1 py-0.5 font-medium text-primary"
            title="Mentioned colleague"
          >
            {s.value}
          </span>
        ) : (
          <span key={i}>{s.value}</span>
        ),
      )}
    </span>
  );
}
