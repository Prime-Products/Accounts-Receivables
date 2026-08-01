import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Bot, Loader2, Send, Sparkles, Trash2, X, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

type ChatMessage = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "ar-assistant:thread";
const SIZE_KEY = "ar-assistant:size";
const MIN_W = 340;
const MIN_H = 380;

/**
 * Floating in-app assistant.
 *
 * A launcher button sits bottom-right on every screen; clicking it opens a
 * resizable chat panel that answers questions about the user's live AR data and
 * about how AR Pro works. The thread is kept in localStorage so switching pages
 * (or reloading) does not lose the conversation. Read-only: no mutations to data.
 */
export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (Array.isArray(saved)) return saved.slice(-40);
    } catch {
      /* ignore */
    }
    return [];
  });
  const [size, setSize] = useState<{ w: number; h: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SIZE_KEY) ?? "null");
      if (saved && typeof saved.w === "number" && typeof saved.h === "number") return saved;
    } catch {
      /* ignore */
    }
    return { w: 420, h: 560 };
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const intro = trpc.assistant.intro.useQuery(undefined, { enabled: open, staleTime: 60 * 60 * 1000 });

  const ask = trpc.assistant.ask.useMutation({
    onSuccess: res => {
      setMessages(prev => [...prev, { role: "assistant", content: res.answer }]);
      // Hand focus straight back to the composer so the next question can be typed
      // immediately after an answer lands.
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    onError: err => {
      toast.error(err.message || "Ο βοηθός δεν είναι διαθέσιμος τώρα");
      // Drop the optimistic user turn so the thread does not end on a dead question
      setMessages(prev => (prev[prev.length - 1]?.role === "user" ? prev.slice(0, -1) : prev));
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* ignore */
    }
  }, [messages]);

  // Keep the newest message in view while answers stream in.
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, ask.isPending, open]);

  // Cmd/Ctrl+J toggles the panel — keyboard-initiated, so no animation delay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Resize listeners stay mounted for the panel's lifetime: attaching them only
  // when a drag starts left the previous implementation dependent on a re-render,
  // and a missed mouseup could leave `userSelect: none` on the body — which makes
  // the whole panel feel dead (no typing, no clicks).
  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      const start = resizing.current;
      if (!start) return;
      // Panel is anchored bottom-right, so dragging the top-left grip grows it.
      const w = Math.max(MIN_W, Math.min(window.innerWidth - 32, start.w + (start.x - e.clientX)));
      const h = Math.max(MIN_H, Math.min(window.innerHeight - 32, start.h + (start.y - e.clientY)));
      setSize({ w, h });
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = null;
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(size));
      } catch {
        /* ignore */
      }
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      resizing.current = null;
      document.body.style.userSelect = "";
    };
  }, [open, size]);

  // Focus the composer whenever the panel opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || ask.isPending) return;
    const history = messages.slice(-8);
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setInput("");
    ask.mutate({ question, history });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ρώτησε τον βοηθό (Ctrl/Cmd + J)"
        aria-label="Open AI assistant"
        className="fixed bottom-5 right-5 z-50 flex h-12 items-center gap-2 rounded-full bg-sky-700 px-4 text-sm font-medium text-white shadow-lg shadow-sky-900/25 transition-transform duration-150 hover:bg-sky-800 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">Ask AR Pro</span>
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl"
      style={{ width: size.w, height: size.h, maxWidth: "calc(100vw - 2rem)", maxHeight: "calc(100vh - 2rem)" }}
      role="dialog"
      aria-label="AR Pro assistant"
    >
      {/* drag grip (top-left corner) */}
      <div
        className="absolute left-0 top-0 z-10 h-4 w-4 cursor-nwse-resize"
        onMouseDown={e => {
          resizing.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
          document.body.style.userSelect = "none";
        }}
        title="Σύρε για αλλαγή μεγέθους"
      />
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-700 text-white">
            <Bot className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">AR Pro Assistant</div>
            <div className="text-[11px] text-muted-foreground">Ρωτά για δεδομένα και λειτουργίες</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Καθάρισε συνομιλία"
              onClick={() => setMessages([])}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Ελαχιστοποίηση" onClick={() => setOpen(false)}>
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Κλείσιμο" onClick={() => setOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea ref={scrollRef} className="relative z-0 flex-1 px-3 py-3">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ρώτησέ με για υπόλοιπα, overdue, forecast, ομίλους, πλοία και επαφές — ή για το πώς δουλεύει κάποια οθόνη.
            </p>
            <div className="space-y-1.5">
              {(intro.data?.suggestions ?? []).map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-left text-xs transition-colors duration-150 hover:border-sky-300 hover:bg-sky-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[92%] rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-sky-700 text-white"
                      : "border bg-background text-foreground",
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none break-words prose-p:my-1.5 prose-table:my-2 prose-td:px-2 prose-th:px-2 prose-ul:my-1.5 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
                      <Streamdown>{m.content}</Streamdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
            {ask.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Ψάχνω στα δεδομένα...
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="relative z-10 shrink-0 border-t bg-muted/30 p-2">
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Γράψε την ερώτησή σου..."
            rows={2}
            className="max-h-32 min-h-[38px] resize-none bg-background text-sm"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0 bg-sky-700 text-white transition-transform duration-150 hover:bg-sky-800 active:scale-[0.97]"
            disabled={!input.trim() || ask.isPending}
            onClick={() => send(input)}
            title="Αποστολή (Enter)"
          >
            {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
