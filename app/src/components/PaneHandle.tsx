import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, useRef } from "react";
import { clampWidth, type Pane, resetWidth, saveWidth, setWidth } from "@/lib/panes";
import { cn } from "@/lib/utils";

// How far one press of ← or → moves the edge, in px.
const KEY_STEP = 16;

// The drag handle on the edge of the left list or the right side column. Drag to resize (remembered between
// launches), double-click to go back to the default width, or focus it and use ← →.
export function PaneHandle({ pane, className }: { pane: Pane; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // The list grows when dragged right; the side column (on the right) grows when dragged left.
  const grows = pane === "list" ? 1 : -1;
  const paneWidth = () => ref.current?.parentElement?.getBoundingClientRect().width ?? 0;

  const onPointerDown = (down: ReactPointerEvent<HTMLDivElement>) => {
    if (down.button !== 0) return;
    down.preventDefault();
    const handle = down.currentTarget;
    handle.setPointerCapture(down.pointerId);
    const startX = down.clientX;
    const startWidth = paneWidth();
    let width = startWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (move: PointerEvent) => {
      width = clampWidth(pane, startWidth + (move.clientX - startX) * grows);
      setWidth(pane, width);
    };
    const onRelease = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onRelease);
      handle.removeEventListener("pointercancel", onRelease);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (width !== startWidth) saveWidth(pane, width);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onRelease);
    handle.addEventListener("pointercancel", onRelease);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? KEY_STEP : -KEY_STEP;
    const width = clampWidth(pane, paneWidth() + step * grows);
    setWidth(pane, width);
    saveWidth(pane, width);
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
      className={cn("group absolute inset-y-0 z-10 flex cursor-col-resize justify-center outline-none", className)}
    >
      <div className="w-0.5 bg-transparent transition-colors group-hover:bg-selection group-focus-visible:bg-selection group-active:bg-selection" />
    </div>
  );
}
