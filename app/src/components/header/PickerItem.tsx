import type { ReactNode } from "react";
import { InfoButton } from "@/components/InfoButton";
import { SELECTED_ROW } from "@/components/ListRow";
import { CommandItem } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// For a picker's list of rows: a little space between rows, and the heading lined up with the rows' text.
export const PICKER_GROUP =
  "**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-items]]:flex **:[[cmdk-group-items]]:flex-col **:[[cmdk-group-items]]:gap-1";

interface Props {
  value: string; // what the list's search and keyboard position go by
  on: boolean; // the one on screen
  title: string;
  files?: { n: number; label: string; title: string };
  sub?: ReactNode;
  onSelect: () => void;
}

// One row of the repo or branch list: the name, a badge describing its file count (hidden when zero), and an
// optional faint line under it. The one on screen is highlighted like the selected row in the Changes and Timeline
// lists (blue, with a bar on the left).
export function PickerItem({ value, on, title, files, sub, onSelect }: Props) {
  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      aria-current={on || undefined}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-md px-3 py-1.5",
        on && `${SELECTED_ROW} data-selected:bg-selection-bg data-selected:text-accent-foreground`,
      )}
    >
      <span className="truncate font-medium">{title}</span>
      <span className="col-start-2">
        {!!files?.n && (
          <span
            title={files.title}
            className="inline-block max-w-48 truncate rounded-full bg-foreground/10 px-1.5 align-middle text-micro text-muted-foreground"
          >
            {files.label}
          </span>
        )}
      </span>
      {sub && <span className="col-span-2 min-w-0 truncate text-mini text-faint">{sub}</span>}
    </CommandItem>
  );
}

// An ⓘ after a picker heading. Not tabbable, so the popover's auto-focus doesn't land on it and open the tooltip;
// it opens on hover only.
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <InfoButton tabIndex={-1} aria-label={label} />
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-64">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
