import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CommunicationTimeline, type TimelineEntry } from "@/components/CommunicationTimeline";
import { useIsMobile } from "@/hooks/useMobile";
import { MessageSquare, PanelRightClose, PanelRightOpen } from "lucide-react";

/** One shared key: the collector's choice follows them from company to group card. */
const STORAGE_KEY = "ar-communication-panel-open";

/**
 * Desktop opens the panel by default (there is a spare column for it); phones
 * start closed, because there the panel is a full-screen sheet and would hide
 * the figures the moment the card loads.
 */
function readStored(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "closed") return false;
  if (stored === "open") return true;
  return window.innerWidth >= 768;
}

/**
 * Open/closed state of the Communication panel, remembered across pages and
 * reloads so the collector does not have to re-hide it on every card.
 */
export function useCommunicationPanel() {
  const [open, setOpen] = useState(true);
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

/** Header button that opens/hides the panel and always shows the entry count. */
export function CommunicationToggle({ open, onToggle, count }: ToggleProps) {
  return (
    <Button
      size="sm"
      variant={open ? "secondary" : "outline"}
      className="h-8 gap-1.5 bg-background text-xs"
      onClick={onToggle}
      title={open ? "Hide the communication history" : "Show the communication history"}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      Communication{count > 0 ? ` (${count})` : ""}
      {open ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
    </Button>
  );
}

interface PanelProps {
  open: boolean;
  onClose: () => void;
  entries: TimelineEntry[];
  isLoading?: boolean;
  title?: string;
  /** Rendered in the panel header, e.g. the "Log call" button. */
  actions?: React.ReactNode;
}

/**
 * The communication history as a column beside the figures instead of a block in
 * the middle of the card: the money flow (KPIs → aging → transactions) stays
 * uninterrupted, while the history is one click away and sticks to the viewport
 * as the user scrolls. On small screens there is no room for a second column, so
 * the same content opens as a slide-over sheet.
 */
export function CommunicationPanel({ open, onClose, entries, isLoading, title = "Communication", actions }: PanelProps) {
  const isMobile = useIsMobile();

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
    <aside className="w-[22rem] shrink-0">
      <div className="sticky top-4 rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2 pb-2">
          <div className="text-sm font-semibold">
            {title}
            {entries.length > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">{entries.length}</span>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={onClose}
            title="Hide the communication history"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
        <CommunicationTimeline
          entries={entries}
          isLoading={isLoading}
          actions={actions}
          embedded
          maxHeightClass="max-h-[calc(100vh-14rem)]"
        />
      </div>
    </aside>
  );
}
