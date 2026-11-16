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
}

// Changes: groups of changed files on the left, the selected file's diff and review on the right.
export function ChangesView({ snap, active, focus, inTimeline, onShowInTimeline }: Props) {
  const { sections, rows } = useMemo(() => buildSections(snap), [snap]);
  const [selected, setSelected] = useState(0);
  const [showAgent, setShowAgent] = useState(false);
  const review = useReview(snap);
  const sel = Math.min(selected, Math.max(0, rows.length - 1));
  const row = rows[sel];

  useEffect(() => setSelected(0), [snap.path, snap.branch]);
  useEffect(() => {
    const i = focus ? rows.findIndex((r) => r.file.path === focus.path) : -1;
    if (i >= 0) setSelected(i);
  }, [focus, rows]);
  // j / k step through files, a / x approve or reject the selected one.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea, [cmdk-root]")) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setSelected((i) => Math.max(0, Math.min(rows.length - 1, i + (e.key === "j" ? 1 : -1))));
      } else if ((e.key === "a" || e.key === "x") && row) {
        e.preventDefault();
        review.toggle(row.file, e.key === "a" ? "approved" : "rejected");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, rows.length, row, review]);

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
      <nav aria-label="Change groups" className="flex w-[300px] min-w-[240px] shrink-0 flex-col border-r bg-sidebar">
        <div className="flex items-center justify-between gap-2 px-3 pt-3.5">
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={showAgent ? "agent" : "files"} onValueChange={(v) => v && setShowAgent(v === "agent")}>
            <ToggleGroupItem value="files">Files</ToggleGroupItem>
            <ToggleGroupItem value="agent">Files + Agent</ToggleGroupItem>
          </ToggleGroup>
          <span className="text-xs text-faint">{plural(snap.stats.files, "file")}</span>
        </div>
        {/* Radix sizes the content as a table, which lets long text push past the edge; keep it a block. */}
        <ScrollArea className="min-h-0 flex-1 px-3 [&_[data-slot=scroll-area-viewport]>div]:!block">
          <ChangesList sections={sections} selected={sel} showAgent={showAgent} reviewOf={review.stateOf} onSelect={setSelected} />
        </ScrollArea>
      </nav>
      {row && (
        <FileDetail
          row={row}
          count={rows.length}
          rows={rows}
          diff={snap.diffs[row.file.path] ?? ""}
          review={review.stateOf(row.file)}
          inTimeline={inTimeline(row.file.path)}
          onShowInTimeline={() => onShowInTimeline(row.file.path)}
          onReview={(s) => review.toggle(row.file, s)}
          onStep={(d) => setSelected((i) => Math.max(0, Math.min(rows.length - 1, i + d)))}
          onSelect={setSelected}
        />
      )}
    </div>
  );
}
