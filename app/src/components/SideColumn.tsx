import type { ReactNode } from "react";
import { PaneHandle } from "@/components/PaneHandle";

// The column on the right of every screen (beside the diff, or the map). Its width comes from --side-w in
// index.css, so it sits in the same place on all three screens and nothing jumps when switching. Its left edge
// can be dragged; the handle fills the 12px gap beside it. Its min width is the narrowest the file card goes (its
// jump buttons only, see lib/panes.ts), kept here too so a switch to a roomier density never squeezes it below that.
export function SideColumn({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="@container relative flex w-(--side-w) min-w-[calc(--spacing(19)+2px)] shrink-0">
      <PaneHandle pane="side" className="-left-3 w-3" />
      <aside aria-label={label} className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
        {children}
      </aside>
    </div>
  );
}
