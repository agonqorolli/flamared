import { cn } from "@/lib/utils";

// A small card for the column beside a diff (Uses, Used by, File history, Same step) and the map's side panel.
export function MiniCard({ title, empty, children }: { title: React.ReactNode; empty: string; children?: React.ReactNode[] }) {
  const rows = (children ?? []).filter(Boolean);
  return (
    <section className="flex flex-col gap-0.5 rounded-xl border bg-card p-2">
      <div className="px-1 pb-0.5 text-[10px] font-medium tracking-[.06em] text-faint uppercase">{title}</div>
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
        "flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-subtle hover:bg-raised",
        on && "bg-selection-bg text-accent-foreground hover:bg-selection-bg",
      )}
    >
      {children}
    </button>
  );
}
