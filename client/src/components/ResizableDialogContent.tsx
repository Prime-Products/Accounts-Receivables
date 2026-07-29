/**
 * A DialogContent variant that users can resize by dragging edge/corner handles.
 * Size is persisted per-dialog (storageKey) in localStorage.
 */
import { DialogContent } from "@/components/ui/dialog";
import * as React from "react";

interface Props extends React.ComponentProps<typeof DialogContent> {
  /** Key under which the chosen size is remembered. */
  storageKey: string;
  /** Initial size as viewport fractions (defaults ~ large dialog). */
  defaultWidth?: number; // px
  defaultHeight?: number; // px
  minWidth?: number;
  minHeight?: number;
}

type Dir = "e" | "s" | "se" | "w" | "sw";

export function ResizableDialogContent({
  storageKey,
  defaultWidth,
  defaultHeight,
  minWidth = 420,
  minHeight = 280,
  className,
  style,
  children,
  ...props
}: Props) {
  const key = `dialog-size:${storageKey}`;
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved && typeof saved.w === "number" && typeof saved.h === "number") return saved;
    } catch {
      /* ignore */
    }
    return null;
  });

  const clamp = React.useCallback(
    (w: number, h: number) => ({
      w: Math.min(Math.max(w, minWidth), Math.floor(window.innerWidth * 0.98)),
      h: Math.min(Math.max(h, minHeight), Math.floor(window.innerHeight * 0.96)),
    }),
    [minWidth, minHeight],
  );

  const contentRef = React.useRef<HTMLDivElement | null>(null);

  const startDrag = (dir: Dir) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = contentRef.current;
    const rect = el?.getBoundingClientRect();
    const startW = size?.w ?? rect?.width ?? defaultWidth ?? 800;
    const startH = size?.h ?? rect?.height ?? defaultHeight ?? 600;
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev: PointerEvent) => {
      let dw = 0;
      let dh = 0;
      // Dialog is centered, so dragging an edge grows both sides visually; scale x2 keeps the
      // handle tracking the pointer.
      if (dir.includes("e")) dw = (ev.clientX - startX) * 2;
      if (dir.includes("w")) dw = (startX - ev.clientX) * 2;
      if (dir.includes("s")) dh = (ev.clientY - startY) * 2;
      setSize(clamp(startW + dw, startH + dh));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setSize(s => {
        if (s) {
          try {
            localStorage.setItem(key, JSON.stringify(s));
          } catch {
            /* ignore */
          }
        }
        return s;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.cursor = dir === "s" ? "ns-resize" : dir === "e" || dir === "w" ? "ew-resize" : dir === "sw" ? "nesw-resize" : "nwse-resize";
    document.body.style.userSelect = "none";
  };

  const reset = () => {
    setSize(null);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  const sizeStyle: React.CSSProperties = size
    ? { width: size.w, height: size.h, maxWidth: "98vw", maxHeight: "96vh" }
    : {
        ...(defaultWidth ? { width: defaultWidth } : {}),
        ...(defaultHeight ? { height: defaultHeight } : {}),
      };

  return (
    <DialogContent
      ref={contentRef}
      className={className}
      style={{ ...sizeStyle, ...style }}
      {...props}
    >
      {children}
      {/* Resize handles */}
      <span
        onPointerDown={startDrag("e")}
        onDoubleClick={reset}
        title="Drag to resize · double-click to reset"
        className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize select-none touch-none hover:bg-primary/15"
      />
      <span
        onPointerDown={startDrag("w")}
        onDoubleClick={reset}
        title="Drag to resize · double-click to reset"
        className="absolute top-0 left-0 h-full w-1.5 cursor-ew-resize select-none touch-none hover:bg-primary/15"
      />
      <span
        onPointerDown={startDrag("s")}
        onDoubleClick={reset}
        title="Drag to resize · double-click to reset"
        className="absolute bottom-0 left-0 w-full h-1.5 cursor-ns-resize select-none touch-none hover:bg-primary/15"
      />
      <span
        onPointerDown={startDrag("sw")}
        onDoubleClick={reset}
        title="Drag to resize · double-click to reset"
        className="absolute bottom-0 left-0 h-4 w-4 cursor-nesw-resize select-none touch-none"
      />
      <span
        onPointerDown={startDrag("se")}
        onDoubleClick={reset}
        title="Drag to resize · double-click to reset"
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize select-none touch-none flex items-end justify-end p-0.5"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" className="text-muted-foreground/60">
          <path d="M9 1v8H1" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M9 5v4H5" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </span>
    </DialogContent>
  );
}
