import { type ComponentProps, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// How a selected row looks in every list: a blue background, no edge bar.
export const SELECTED_ROW = "bg-selection-bg text-accent-foreground";
// A row's size and spacing, shared by rows that are only shown (a check in Timeline) so they line up with the others.
export const ROW_LAYOUT =
  "flex min-h-7 w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-xs text-subtle";

interface Props extends ComponentProps<"button"> {
  on: boolean; // the selected row
}

// One row of a left list (a file in Changes, an edit in Timeline). The selected row is highlighted, and scrolls
// into view when it becomes the selected one.
export function ListRow({ on, className, children, ...props }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (on) ref.current?.scrollIntoView({ block: "nearest" });
  }, [on]);
  return (
    <button
      ref={ref}
      aria-current={on || undefined}
      className={cn(ROW_LAYOUT, "hover:bg-raised", on && `${SELECTED_ROW} hover:bg-selection-bg`, className)}
      {...props}
    >
      {children}
    </button>
  );
}

// The dot on a row that is new, or changed again, since you last selected it.
export function FreshDot({ title }: { title: string }) {
  return <span className="size-1.5 shrink-0 rounded-full bg-selection" title={title} />;
}
