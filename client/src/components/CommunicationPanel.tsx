import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CommunicationTimeline, type TimelineEntry } from "@/components/CommunicationTimeline";
import { CommunicationAiSummary } from "@/components/CommunicationAiSummary";
import { useIsMobile } from "@/hooks/useMobile";
import { GripVertical, MessageSquare, X } from "lucide-react";

/** One shared key: the collector's choice follows them from company to group card. */
const STORAGE_KEY = "ar-communication-panel-open";
/** Remembered geometry of the floating window (position + size). */
const GEOMETRY_KEY = "ar-communication-window-geometry";

const MIN_W = 320;
const MIN_H = 240;
const DEFAULT_W = 400;
const DEFAULT_H = 460;

interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The window starts closed: it is a tool the collector reaches for, not
 * something that should cover the figures the moment a card loads.
 */
function readStored(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "open";
}

/** Default position: top-right, clear of the sidebar, inside the viewport. */
function defaultGeometry(): Geometry {
  const w = DEFAULT_W;
  const h = DEFAULT_H;
  if (typeof window === "undefined") return { x: 40, y: 80, w, h };
  return {
    x: Math.max(16, window.innerWidth - w - 32),
    y: 96,
    w,
    h: Math.min(h, Math.max(MIN_H, window.innerHeight - 140)),
  };
}

function readGeometry(): Geometry {
  if (typeof window === "undefined") return defaultGeometry();
  try {
    const raw = window.localStorage.getItem(GEOMETRY_KEY);
    if (!raw) return defaultGeometry();
    const parsed = JSON.parse(raw) as Partial<Geometry>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return defaultGeometry();
    return clampGeometry({
      x: parsed.x,
      y: parsed.y,
      w: typeof parsed.w === "number" ? parsed.w : DEFAULT_W,
      h: typeof parsed.h === "number" ? parsed.h : DEFAULT_H,
    });
  } catch {
    return defaultGeometry();
  }
}

/** Keep the window inside the viewport, so it can never be dragged out of reach. */
function clampGeometry(g: Geometry): Geometry {
  if (typeof window === "undefined") return g;
  const w = Math.min(Math.max(g.w, MIN_W), Math.max(MIN_W, window.innerWidth - 24));
  const h = Math.min(Math.max(g.h, MIN_H), Math.max(MIN_H, window.innerHeight - 24));
  return {
    w,
    h,
    x: Math.min(Math.max(g.x, 8), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(g.y, 8), Math.max(8, window.innerHeight - h - 8)),
  };
}

/**
 * Open/closed state of the Communication window, remembered across pages and
 * reloads so the collector does not have to re-hide it on every card.
 */
export function useCommunicationPanel() {
  const [open, setOpen] = useState(false);
  // Read after mount to keep SSR/first paint deterministic.
  useEffect(() => setOpen(readStored()), []);
  const toggle = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "open" : "closed");
      } catch {
        // private mode / quota — the session still works, just without memory
      }
      return next;
    });
  }, []);
  return { open, toggle, setOpen };
}

interface ToggleProps {
  open: boolean;
  onToggle: () => void;
  count: number;
}

/** Header button that opens/hides the window and always shows the entry count. */
export function CommunicationToggle({ open, onToggle, count }: ToggleProps) {
  return (
    <Button
      size="sm"
      variant={open ? "secondary" : "outline"}
      className="h-8 gap-1.5 bg-background text-xs"
      onClick={onToggle}
      title={open ? "Close the communication window" : "Open the communication history in a movable window"}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      Communication{count > 0 ? ` (${count})` : ""}
    </Button>
  );
}

interface PanelProps {
  open: boolean;
  onClose: () => void;
  entries: TimelineEntry[];
  isLoading?: boolean;
  title?: string;
  /** Rendered in the window header, e.g. the "Log call" button. */
  actions?: React.ReactNode;
  /**
   * Collections group whose recent history the AI summary reads. When omitted the
   * summary button is not offered (there is nothing to scope it to).
   */
  group?: string;
}

/**
 * Communication history as a floating window.
 *
 * A side column reflowed the card and squeezed the KPI figures; a modal blocked
 * the numbers entirely. So the history now floats above the page: drag it by the
 * title bar, resize it from the bottom-right corner, and the card underneath
 * keeps its full width and stays readable and clickable. Position and size are
 * remembered. On phones there is no room to float, so the same content opens as
 * a slide-over sheet.
 */
export function CommunicationPanel({ open, onClose, entries, isLoading, title = "Communication", actions, group }: PanelProps) {
  const isMobile = useIsMobile();
  const [geometry, setGeometry] = useState<Geometry>(defaultGeometry);
  const dragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; base: Geometry } | null>(null);

  // Restore the remembered geometry the first time the window is opened.
  useEffect(() => {
    if (open) setGeometry(readGeometry());
  }, [open]);

  // A shrinking viewport must not strand the window off-screen.
  useEffect(() => {
    if (!open) return;
    const onResize = () => setGeometry(g => clampGeometry(g));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  const persist = useCallback((g: Geometry) => {
    try {
      window.localStorage.setItem(GEOMETRY_KEY, JSON.stringify(g));
    } catch {
      // memory is a nicety, not a requirement
    }
  }, []);

  const startDrag = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, base: geometry };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const next =
      drag.mode === "move"
        ? { ...drag.base, x: drag.base.x + dx, y: drag.base.y + dy }
        : { ...drag.base, w: drag.base.w + dx, h: drag.base.h + dy };
    setGeometry(clampGeometry(next));
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setGeometry(g => {
      const clamped = clampGeometry(g);
      persist(clamped);
      return clamped;
    });
  };

  if (!open) return null;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={o => !o && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-3 overflow-y-auto">
          <SheetHeader className="p-0">
            <SheetTitle className="text-base">
              {title}
              {entries.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">{entries.length} entries</span>
              )}
            </SheetTitle>
          </SheetHeader>
          {group && <CommunicationAiSummary group={group} />}
          <CommunicationTimeline
            entries={entries}
            isLoading={isLoading}
            actions={actions}
            embedded
            maxHeightClass="max-h-none"
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    // No backdrop on purpose: the card underneath stays fully usable.
    <div
      role="dialog"
      aria-label={title}
      className="fixed z-40 flex flex-col overflow-hidden rounded-lg border bg-card shadow-2xl"
      style={{ left: geometry.x, top: geometry.y, width: geometry.w, height: geometry.h }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* Title bar = drag handle */}
      <div
        className="flex cursor-move items-center justify-between gap-2 border-b bg-muted/50 px-2 py-1.5 select-none"
        onPointerDown={startDrag("move")}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-semibold">{title}</span>
          {entries.length > 0 && (
            <span className="shrink-0 text-xs font-normal text-muted-foreground">{entries.length}</span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 shrink-0 p-0"
          onClick={onClose}
          onPointerDown={e => e.stopPropagation()}
          title="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden p-2">
        <CommunicationTimeline
          entries={entries}
          isLoading={isLoading}
          actions={
            group ? (
              <>
                {actions}
                <CommunicationAiSummary group={group} />
              </>
            ) : (
              actions
            )
          }
          embedded
          maxHeightClass="max-h-full"
        />
      </div>

      {/* Resize grip — bottom-right corner, the convention everywhere else. */}
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        onPointerDown={startDrag("resize")}
        title="Resize"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-muted-foreground/70">
          <path d="M15 5 L5 15 M15 10 L10 15" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </div>
    </div>
  );
}
