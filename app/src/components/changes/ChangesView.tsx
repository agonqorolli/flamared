import { useEffect, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BranchEmpty } from "@/components/BranchEmpty";
import { plural } from "@/lib/format";
import { useReview } from "@/lib/review";
import type { Snapshot } from "@/lib/types";
import { buildSections } from "./model";
import { ChangesList } from "./ChangesList";
import { FileDetail } from "./FileDetail";
import { hint, useKeys } from "@/lib/keys";
import { KeyHint } from "@/components/KeyHint";
import { PaneHandle } from "@/components/PaneHandle";

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
  const hasWords = sections.some((s) => s.blocks.some((b) => b.words));
  // The selection follows the file, so a reload that adds or removes files above it doesn't move you.
  // When the file itself leaves the change, the row now at its old position takes over.
  const [selected, setSelectedState] = useState<{ path: string | null; index: number }>({ path: null, index: 0 });
  const [showAgent, setShowAgent] = useState(false);
  const review = useReview(snap);
  const byPath = selected.path ? rows.findIndex((r) => r.file.path === selected.path) : -1;
  const sel = byPath >= 0 ? byPath : Math.min(selected.index, Math.max(0, rows.length - 1));
  const row = rows[sel];
  const select = (i: number) => {
    const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (!r) return;
    setSelectedState({ path: r.file.path, index: r.index });
    onSeen(r.file.path);
  };

  useEffect(() => setSelectedState({ path: null, index: 0 }), [snap.path, snap.branch]);
  useEffect(() => {
    const i = focus ? rows.findIndex((r) => r.file.path === focus.path) : -1;
    if (i >= 0) select(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  // J / K step through files, A shows the agent's messages, T / M jump to the file elsewhere. G / W are handled by
  // the file view, which knows which version is on screen.
  useKeys(active, {
    next: () => select(sel + 1),
    prev: () => select(sel - 1),
    agent: hasWords && (() => setShowAgent(!showAgent)),
    toTimeline: !!row && inTimeline(row.file.path) && (() => onShowInTimeline(row.file.path)),
    toMap: !!row && (() => onShowInMap(row.file.path)),
  });

  if (!rows.length) {
    return <BranchEmpty branch={snap.viewing.branch} />;
  }

  return (
    <div className="flex min-h-0 flex-1">
      <nav
        aria-label="Change groups"
        className="@container relative flex w-(--list-w) shrink-0 flex-col border-r bg-sidebar"
      >
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={showAgent && hasWords ? "agent" : "files"}
            onValueChange={(v) => v && setShowAgent(v === "agent")}
          >
            <ToggleGroupItem value="files">Files</ToggleGroupItem>
            {/* Off when no agent message belongs to these changes, so the toggle never silently does nothing. */}
            <ToggleGroupItem
              value="agent"
              disabled={!hasWords}
              title={
                hasWords
                  ? `Show the agent's latest message on each group (${hint("agent")})`
                  : "No agent messages for these changes"
              }
            >
              {/* Just "Agent" when the list is dragged narrow. */}
              <span className="@max-[11rem]:hidden">Files +&nbsp;</span>Agent
              <KeyHint id="agent" />
            </ToggleGroupItem>
          </ToggleGroup>
          {/* Hidden when the list is dragged too narrow for it beside the toggle. */}
          <span className="hidden text-xs whitespace-nowrap text-faint @min-[14rem]:inline">
            {plural(snap.stats.files, "file")}
          </span>
        </div>
        {/* Radix sizes the content as a table, which lets long text push past the edge; keep it a block. */}
        <ScrollArea className="min-h-0 flex-1 px-3 [&_[data-slot=scroll-area-viewport]>div]:!block">
          <ChangesList
            sections={sections}
            selected={sel}
            showAgent={showAgent && hasWords}
            fresh={fresh}
            reviewOf={review.stateOf}
            onSelect={select}
          />
        </ScrollArea>
        <PaneHandle pane="list" className="-right-1 w-2" />
      </nav>
      {row && (
        <FileDetail
          row={row}
          active={active}
          count={rows.length}
          rows={rows}
          diff={snap.diffs[row.file.path] ?? ""}
          reviewOf={(d) => review.stateOf(row.file, d)}
          inTimeline={inTimeline(row.file.path)}
          onShowInTimeline={() => onShowInTimeline(row.file.path)}
          onShowInMap={() => onShowInMap(row.file.path)}
          // Marking a file moves on to the next one not checked yet (wrapping round); clearing a mark stays put.
          onReview={(s, shown) => {
            review.toggle(row.file, s, shown);
            if (!s) return;
            const next = rows
              .map((_, k) => (sel + 1 + k) % rows.length)
              .find((i) => i !== sel && !review.stateOf(rows[i].file));
            if (next !== undefined) select(next);
          }}
          onStep={(d) => select(sel + d)}
          onSelect={select}
          onShowLatest={() => onSeen(row.file.path)}
        />
      )}
    </div>
  );
}
