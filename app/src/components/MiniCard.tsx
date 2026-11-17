import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/Eyebrow";

// A small card for the column beside a diff (Uses, Used by, File history, Same step) and the map's side panel.
export function MiniCard({ title, empty, children }: { title: React.ReactNode; empty: string; children?: React.ReactNode[] }) {
  const rows = (children ?? []).filter(Boolean);
  return (
    <section className="flex flex-col gap-0.5 rounded-xl border bg-card p-2">
      <Eyebrow className="px-1 pb-0.5">{title}</Eyebrow>
      {rows.length ? rows : empty ? <div className="px-1 pb-1 text-xs text-faint">{empty}</div> : null}
    </section>
  );
}

export function MiniRow({ on, title, onClick, children }: { on?: boolean; title?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-current={on || undefined}
      className={cn(
        // In a side column dragged very narrow, what follows the name wraps under it, and anything still too wide for the
        // row is cut short (the row's title has it all), instead of pushing past the edge.
        "flex min-w-0 items-center gap-x-2 rounded-md px-1.5 py-1 text-left text-xs text-subtle hover:bg-raised @max-[8rem]:flex-wrap @max-[8rem]:*:max-w-full @max-[8rem]:*:truncate",
        on && "bg-selection-bg text-accent-foreground hover:bg-selection-bg",
      )}
    >
      {children}
    </button>
  );
}
