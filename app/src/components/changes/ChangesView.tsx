import { useEffect, useMemo, useState } from "react";
import { BranchEmpty } from "@/components/BranchEmpty";
import { AgentToggle, ListPane } from "@/components/ListPane";
import { plural } from "@/lib/format";
import { useKeys } from "@/lib/keys";
import { type ReviewState, useReview } from "@/lib/review";
import type { Snapshot } from "@/lib/types";
import { clamp } from "@/lib/utils";
import { ChangesList } from "./ChangesList";
import { FileDetail } from "./FileDetail";
import { buildSections } from "./model";

interface Props {
  snap: Snapshot;
  active: boolean;
  focus: { path: string; n: number } | null; // "Open in Changes" from another screen
  inTimeline: (path: string) => boolean;
  onShowInTimeline: (path: string) => void;
  onShowInMap: (path: string) => void;
  fresh: Set<string>; // files new or changed since last selected (marked in the list)
  onSeen: (path: string) => void;
}

// Changes: groups of changed files on the left, the selected file's diff and review on the right.
export function ChangesView({ snap, active, focus, inTimeline, onShowInTimeline, onShowInMap, fresh, onSeen }: Props) {
  const { sections, rows } = useMemo(() => buildSections(snap), [snap]);
  const hasWords = sections.some((section) => section.blocks.some((block) => block.words));
  const [showAgent, setShowAgent] = useState(false);
  const review = useReview(snap);

  // The selection follows the file, so a reload that adds or removes files above it doesn't move you.
  // When the file itself leaves the change, the row now at its old position takes over.
  const [selected, setSelected] = useState<{ path: string | null; index: number }>({ path: null, index: 0 });
  const byPath = selected.path ? rows.findIndex((row) => row.file.path === selected.path) : -1;
  const selectedIndex = byPath >= 0 ? byPath : Math.min(selected.index, Math.max(0, rows.length - 1));
  const row = rows[selectedIndex];
  const select = (index: number) => {
    const next = rows[clamp(index, 0, rows.length - 1)];
    if (!next) return;
    setSelected({ path: next.file.path, index: next.index });
    onSeen(next.file.path);
  };

  useEffect(() => setSelected({ path: null, index: 0 }), [snap.path, snap.branch]);
  // A jump from another screen selects its file. Only when a jump arrives, not when the rows change.
  useEffect(() => {
    const index = focus ? rows.findIndex((row) => row.file.path === focus.path) : -1;
    if (index >= 0) select(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // J / K step through files, A shows the agent's messages, T / M jump to the file elsewhere. G / W are handled by
  // the file view, which knows which version is on screen.
  useKeys(active, {
    next: () => select(selectedIndex + 1),
    prev: () => select(selectedIndex - 1),
    agent: hasWords && (() => setShowAgent(!showAgent)),
    toTimeline: !!row && inTimeline(row.file.path) && (() => onShowInTimeline(row.file.path)),
    toMap: !!row && (() => onShowInMap(row.file.path)),
  });

  if (!rows.length) {
    return <BranchEmpty branch={snap.viewing.branch} />;
  }

  // Marking a file moves on to the next one not checked yet (wrapping round); clearing a mark stays put.
  const markAndMoveOn = (state: ReviewState | null, shown?: string) => {
    review.toggle(row.file, state, shown);
    if (!state) return;
    const after = rows.map((_, step) => (selectedIndex + 1 + step) % rows.length);
    const next = after.find((index) => index !== selectedIndex && !review.stateOf(rows[index].file));
    if (next !== undefined) select(next);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <ListPane
        label="Change groups"
        toggle={
          <AgentToggle
            what="Files"
            on={showAgent}
            available={hasWords}
            title="Show the agent's latest message on each group"
            unavailableTitle="No agent messages for these changes"
            onChange={setShowAgent}
          />
        }
        count={
          // Hidden when the list is dragged too narrow for it beside the toggle.
          <span className="hidden text-xs whitespace-nowrap text-faint @min-[14rem]:inline">
            {plural(snap.stats.files, "file")}
          </span>
        }
      >
        <ChangesList
          sections={sections}
          selected={selectedIndex}
          showAgent={showAgent && hasWords}
          fresh={fresh}
          reviewOf={review.stateOf}
          onSelect={select}
        />
      </ListPane>
      {row && (
        <FileDetail
          row={row}
          rows={rows}
          active={active}
          diff={snap.diffs[row.file.path] ?? ""}
          reviewOf={(diff) => review.stateOf(row.file, diff)}
          inTimeline={inTimeline(row.file.path)}
          onShowInTimeline={() => onShowInTimeline(row.file.path)}
          onShowInMap={() => onShowInMap(row.file.path)}
          onReview={markAndMoveOn}
          onStep={(step) => select(selectedIndex + step)}
          onSelect={select}
          onShowLatest={() => onSeen(row.file.path)}
        />
      )}
    </div>
  );
}
