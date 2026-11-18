import type { ReactNode } from "react";
import { KeyHint } from "@/components/KeyHint";
import { PaneHandle } from "@/components/PaneHandle";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { hint } from "@/lib/keys";

interface Props {
  label: string;
  toggle: ReactNode; // top left: what the list shows
  count: ReactNode; // top right: how much is in it
  children: ReactNode;
}

// The list on the left of Changes and Timeline: a toggle row, the list itself (it scrolls), and the edge to drag.
// Its width comes from --list-w, so it is the same on both screens.
export function ListPane({ label, toggle, count, children }: Props) {
  return (
    <nav aria-label={label} className="@container relative flex w-(--list-w) shrink-0 flex-col border-r bg-sidebar">
      {/* pb-2 keeps scrolled cards from running up against the toggle; the first section label gives that 8px back
          (pt-4 → pt-2), so the list starts where it did before scrolling. */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        {toggle}
        {count}
      </div>
      {/* Radix sizes the content as a table, which lets long text push past the edge; keep it a block. */}
      <ScrollArea className="min-h-0 flex-1 px-3 [&_[data-slot=scroll-area-viewport]>div]:!block [&_section:first-child>div:first-child]:pt-2">
        {children}
      </ScrollArea>
      <PaneHandle pane="list" className="-right-1 w-2" />
    </nav>
  );
}

interface AgentToggleProps {
  what: "Files" | "Edits"; // what the list holds
  on: boolean; // the agent's messages are shown too
  available: boolean; // there are agent messages to show
  title: string; // what turning it on shows
  unavailableTitle: string;
  onChange: (on: boolean) => void;
}

// "Files | Files + Agent": whether the list also shows the agent's messages. Off when no agent message belongs to
// what is listed, so the toggle never silently does nothing.
export function AgentToggle({ what, on, available, title, unavailableTitle, onChange }: AgentToggleProps) {
  const plain = what.toLowerCase();
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={on && available ? "agent" : plain}
      onValueChange={(value) => value && onChange(value === "agent")}
    >
      <ToggleGroupItem value={plain}>{what}</ToggleGroupItem>
      <ToggleGroupItem
        value="agent"
        disabled={!available}
        title={available ? `${title} (${hint("agent")})` : unavailableTitle}
      >
        {/* Just "Agent" when the list is dragged narrow. */}
        <span className="@max-[11rem]:hidden">{`${what} +\u00a0`}</span>Agent
        <KeyHint id="agent" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
