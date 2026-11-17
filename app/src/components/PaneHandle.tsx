// The drag handle on the edge of the left list or the right side column. Drag to resize (remembered between
// launches), double-click to go back to the default width, or focus it and use ← →.
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { type Pane, clampWidth, resetWidth, saveWidth, setWidth } from "@/lib/panes";

export function PaneHandle({ pane, className }: { pane: Pane; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // The list grows when dragged right; the side column (on the right) grows when dragged left.
  const dir = pane === "list" ? 1 : -1;
  const current = () => ref.current?.parentElement?.getBoundingClientRect().width ?? 0;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = current();
    let w = startW;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => {
      w = clampWidth(pane, startW + (ev.clientX - startX) * dir);
      setWidth(pane, w);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (w !== startW) saveWidth(pane, w);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const w = clampWidth(pane, current() + (e.key === "ArrowRight" ? 16 : -16) * dir);
    setWidth(pane, w);
    saveWidth(pane, w);
  };

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label={pane === "list" ? "Resize the list" : "Resize the side column"}
      title="Drag to resize · double-click for the default width"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => resetWidth(pane)}
      onKeyDown={onKeyDown}
      className={cn(
        "group absolute inset-y-0 z-10 flex cursor-col-resize justify-center outline-none",
        className,
      )}
    >
      <div className="w-0.5 bg-transparent transition-colors group-hover:bg-selection group-focus-visible:bg-selection group-active:bg-selection" />
    </div>
  );
}
