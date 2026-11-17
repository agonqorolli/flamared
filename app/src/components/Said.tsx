import { useState } from "react";
import { cn } from "@/lib/utils";

// Something someone said, written like the rows around it: the time in the same left column as the edit times
// (when there is one), then "Who: words" in muted text. Used for your prompt in Timeline and for the agent's last
// message in the file card. Click to expand long text.
export function Said({
  who,
  text,
  when,
  lines = 2,
  title,
}: {
  who: string;
  text: string;
  when?: string;
  lines?: 2 | 4;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <button
      className="flex w-full min-w-0 items-start gap-2 text-left text-xs leading-snug"
      title={title ?? (open ? "Click to show less" : "Click to show the whole message")}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      {/* Left out like the edit times when the Timeline list is dragged narrow. */}
      {when !== undefined && (
        <span className="w-9 shrink-0 pt-px text-micro text-faint tabular-nums @max-[13rem]:hidden">{when}</span>
      )}
      <span
        className={cn("min-w-0 flex-1 text-muted-foreground", !open && (lines === 2 ? "line-clamp-2" : "line-clamp-4"))}
      >
        <span className="font-medium text-subtle">{who}:</span> {text}
      </span>
    </button>
  );
}
