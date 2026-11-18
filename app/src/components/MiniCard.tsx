import { Children, type ReactNode } from "react";
import { Eyebrow } from "@/components/Eyebrow";
import { cn } from "@/lib/utils";

interface CardProps {
  title: ReactNode;
  empty?: string; // shown when the card has no rows
  children?: ReactNode;
}

// A small card for the column beside a diff (Uses, Used by, File history, Same step) and the map's side panel.
export function MiniCard({ title, empty, children }: CardProps) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <section className="flex flex-col gap-0.5 rounded-xl border bg-card p-2">
      <Eyebrow className="px-1 pb-0.5">{title}</Eyebrow>
      {rows.length ? rows : empty ? <div className="px-1 pb-1 text-xs text-faint">{empty}</div> : null}
    </section>
  );
}

interface RowProps {
  on?: boolean; // the row for what is on screen
  title?: string;
  onClick?: () => void; // without it, the row is only shown, not clicked
  children: ReactNode;
}

// A row of a MiniCard, clickable unless it has no `onClick`.
export function MiniRow({ on, title, onClick, children }: RowProps) {
  const className = cn(
    // In a side column dragged very narrow, what follows the name wraps under it, and anything still too wide for the
    // row is cut short (the row's title has it all), instead of pushing past the edge.
    "flex min-w-0 items-center gap-x-2 rounded-md px-1.5 py-1 text-left text-xs text-subtle @max-[8rem]:flex-wrap @max-[8rem]:*:max-w-full @max-[8rem]:*:truncate",
    onClick && "hover:bg-raised",
    on && "bg-selection-bg text-accent-foreground hover:bg-selection-bg",
  );
  if (!onClick) {
    return (
      <div title={title} className={className}>
        {children}
      </div>
    );
  }
  return (
    <button onClick={onClick} title={title} aria-current={on || undefined} className={className}>
      {children}
    </button>
  );
}
