import { useEffect, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { plural } from "@/lib/format";
import { useReview } from "@/lib/review";
import type { Snapshot } from "@/lib/types";
import { buildSections } from "./model";
import { ChangesList } from "./ChangesList";
import { FileDetail } from "./FileDetail";

interface Props {
  snap: Snapshot;
  active: boolean;
  focus: { path: string; n: number } | null; // "Open in Changes" from another screen
  inTimeline: (path: string) => boolean;
  onShowInTimeline: (path: string) => void;
  fresh: Set<string>; // files new or changed since last selected (marked in the list)
  onSeen: (path: string) => void;
}

// Changes: groups of changed files on the left, the selected file's diff and review on the right.
export function ChangesView({ snap, active, focus, inTimeline, onShowInTimeline, fresh, onSeen }: Props) {
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
  // j / k step through files (a / x are handled by the file view, which knows which version is on screen).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea, [cmdk-root]")) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        select(sel + (e.key === "j" ? 1 : -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!rows.length) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyTitle>No changes</EmptyTitle>
          <EmptyDescription>Nothing uncommitted in {snap.repo} right now. Changes appear here as soon as an agent (or you) edits a file.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <nav aria-label="Change groups" className="flex w-75 min-w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex items-center justify-between gap-2 px-3 pt-3.5">
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={showAgent && hasWords ? "agent" : "files"} onValueChange={(v) => v && setShowAgent(v === "agent")}>
            <ToggleGroupItem value="files">Files</ToggleGroupItem>
            {/* Off when no agent message belongs to these changes, so the toggle never silently does nothing. */}
            <ToggleGroupItem value="agent" disabled={!hasWords} title={hasWords ? "Show the agent's latest message on each group" : "No agent messages for these changes"}>
              Files + Agent
            </ToggleGroupItem>
          </ToggleGroup>
          <span className="text-xs text-faint">{plural(snap.stats.files, "file")}</span>
        </div>
        {/* Radix sizes the content as a table, which lets long text push past the edge; keep it a block. */}
        <ScrollArea className="min-h-0 flex-1 px-3 [&_[data-slot=scroll-area-viewport]>div]:!block">
          <ChangesList sections={sections} selected={sel} showAgent={showAgent && hasWords} fresh={fresh} reviewOf={review.stateOf} onSelect={select} />
        </ScrollArea>
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
          onReview={(s, shown) => review.toggle(row.file, s, shown)}
          onStep={(d) => select(sel + d)}
          onSelect={select}
          onShowLatest={() => onSeen(row.file.path)}
        />
      )}
    </div>
  );
}
