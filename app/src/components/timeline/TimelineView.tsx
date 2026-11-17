import { useEffect, useState } from "react";
import { AgentToggle, ListPane } from "@/components/ListPane";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { plural } from "@/lib/format";
import { useKeys } from "@/lib/keys";
import { editKey, type Timeline } from "@/lib/timeline";
import { clamp } from "@/lib/utils";
import { EditDetail } from "./EditDetail";
import { TimelineList } from "./TimelineList";

interface Props {
  timeline: Timeline;
  active: boolean;
  focus: { path: string; n: number } | null; // "Show in Timeline" from another screen: the file's latest edit
  inChanges: (path: string) => boolean;
  onShowInChanges: (path: string) => void;
  onShowInMap: (path: string) => void;
  fresh: Set<string>; // edits that arrived since you last selected them (editKey)
  onSeen: (key: string) => void;
}

// Timeline: every agent edit in order (latest first) with the agent's words, commands and your prompts around it.
export function TimelineView({
  timeline,
  active,
  focus,
  inChanges,
  onShowInChanges,
  onShowInMap,
  fresh,
  onSeen,
}: Props) {
  const { items, edits } = timeline;
  const hasWords = items.some((item) => item.kind === "turn" && item.rows.some((row) => row.kind === "say"));
  const [showAgent, setShowAgent] = useState(false);

  // The selection follows the edit, so new edits arriving at the top don't move you.
  const [selected, setSelected] = useState<{ key: string | null; index: number }>({ key: null, index: 0 });
  const byKey = selected.key ? edits.findIndex((edit) => editKey(edit) === selected.key) : -1;
  const selectedIndex = byKey >= 0 ? byKey : Math.min(selected.index, Math.max(0, edits.length - 1));
  const edit = edits[selectedIndex];
  const select = (index: number) => {
    const next = edits[clamp(index, 0, edits.length - 1)];
    if (!next) return;
    const key = editKey(next);
    // Remembers the position that was asked for, which can be one past either end of the list.
    setSelected({ key, index });
    onSeen(key);
  };

  // A jump from another screen selects the file's latest edit. Only when a jump arrives, not when the edits change.
  useEffect(() => {
    if (!focus) return;
    const index = edits.findIndex((edit) => edit.path === focus.path); // edits are latest first
    if (index >= 0) select(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // J / K step through edits, A shows the agent's messages, C / M jump to the file while it is still changed.
  const stillChanged = !!edit && inChanges(edit.path);
  useKeys(active, {
    next: () => select(selectedIndex + 1),
    prev: () => select(selectedIndex - 1),
    agent: hasWords && (() => setShowAgent(!showAgent)),
    toChanges: stillChanged && (() => onShowInChanges(edit.path)),
    toMap: stillChanged && (() => onShowInMap(edit.path)),
  });

  return (
    <div className="flex min-h-0 flex-1">
      <ListPane
        label="Agent edits"
        toggle={
          <AgentToggle
            what="Edits"
            on={showAgent}
            available={hasWords}
            title="Show the agent's messages between the edits"
            unavailableTitle="No agent messages in these turns"
            onChange={setShowAgent}
          />
        }
        count={
          // Hidden when the list is dragged too narrow for it beside the toggle.
          <span className="hidden items-center gap-1 text-xs whitespace-nowrap text-faint @min-[14rem]:flex">
            {plural(edits.length, "edit")}
          </span>
        }
      >
        <TimelineList
          items={items}
          hasEdits={edits.length > 0}
          selected={selectedIndex}
          showAgent={showAgent && hasWords}
          fresh={fresh}
          onSelect={select}
        />
      </ListPane>
      {edit ? (
        <EditDetail
          key={editKey(edit)}
          edit={edit}
          index={selectedIndex}
          edits={edits}
          inChanges={inChanges(edit.path)}
          onSelect={select}
          onShowInChanges={() => onShowInChanges(edit.path)}
          onShowInMap={() => onShowInMap(edit.path)}
        />
      ) : (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyTitle>No agent edits</EmptyTitle>
            <EmptyDescription>
              No Claude Code or Codex turn edited files that are still in this change.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
