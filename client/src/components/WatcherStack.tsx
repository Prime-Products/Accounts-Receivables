/**
 * WatcherStack — overlapping initial-avatars (colored circles) with a "+N"
 * counter, used to show team members watching a task's progress.
 */
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface WatcherInfo {
  memberId: number;
  name: string;
  title?: string | null;
}

/** Deterministic pastel-ish color per name — same member always gets the same color. */
const PALETTE = [
  "#e8590c", // orange
  "#2f9e44", // green
  "#1971c2", // blue
  "#9c36b5", // purple
  "#c2255c", // pink
  "#0c8599", // teal
  "#e03131", // red
  "#f08c00", // amber
  "#6741d9", // violet
  "#0ca678", // emerald
];

export function watcherColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function watcherInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function WatcherStack({
  watchers,
  max = 3,
  size = "sm",
  className = "",
}: {
  watchers: WatcherInfo[];
  max?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!watchers || watchers.length === 0) return null;
  const shown = watchers.slice(0, max);
  const extra = watchers.length - shown.length;
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  const overlap = size === "sm" ? "-ml-1.5" : "-ml-2";

  return (
    <div className={`flex items-center ${className}`}>
      {shown.map((w, i) => (
        <Tooltip key={w.memberId}>
          <TooltipTrigger asChild>
            <span
              className={`${dim} ${i > 0 ? overlap : ""} inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-background select-none`}
              style={{ backgroundColor: watcherColor(w.name), zIndex: 10 + i }}
            >
              {watcherInitials(w.name)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {w.name}
            {w.title ? ` — ${w.title}` : ""}
          </TooltipContent>
        </Tooltip>
      ))}
      {extra > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`${dim} ${overlap} inline-flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-background select-none`}
              style={{ zIndex: 10 + shown.length }}
            >
              +{extra}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {watchers.slice(max).map(w => w.name).join(", ")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
