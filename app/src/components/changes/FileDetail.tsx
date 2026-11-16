import { useEffect, useState } from "react";
import { CheckIcon, ClockIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DiffView } from "@/components/DiffView";
import { FileCard } from "@/components/FileCard";
import { MiniCard, MiniRow } from "@/components/MiniCard";
import { base } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReviewState } from "@/lib/review";
import { toPatch, type Row } from "./model";

interface Props {
  row: Row;
  active: boolean;
  count: number;
  diff: string;
  rows: Row[];
  reviewOf: (diff: string) => ReviewState | null; // the mark for the version on screen
  inTimeline: boolean;
  onReview: (s: ReviewState | null, shown?: string) => void;
  onStep: (dir: 1 | -1) => void;
  onSelect: (i: number) => void;
  onShowInTimeline: () => void;
  onShowLatest: () => void;
}

export function FileDetail({ row, active, count, diff, rows, reviewOf, inTimeline, onReview, onStep, onSelect, onShowInTimeline, onShowLatest }: Props) {
  const f = row.file;
  // The diff on screen holds still while you read: when the agent changes this file again, a bar offers the
  // newer version instead of swapping it in under you. Moving to another file always shows its latest.
  const [held, setHeld] = useState({ path: f.path, diff });
  useEffect(() => setHeld({ path: f.path, diff }), [f.path]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = held.path === f.path ? held.diff : diff;
  const stale = shown !== diff;
  const review = reviewOf(shown);
  const showLatest = () => {
    setHeld({ path: f.path, diff });
    onShowLatest();
  };
  // A / X approve or reject what is on screen, like the buttons.
  const reviewShown = (s: ReviewState | null) => onReview(s, stale ? shown : undefined);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea, [cmdk-root], [role=dialog]")) return;
      if (e.key !== "a" && e.key !== "x") return;
      e.preventDefault();
      reviewShown(e.key === "a" ? "approved" : "rejected");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const { patch, more } = f.binary || !shown.trim() ? { patch: null, more: null } : toPatch(f, shown);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-3 px-6 pt-2.5 pb-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {stale && (
          <div role="status" className="mb-2 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-selection/40 bg-selection-bg px-3 py-1.5 text-xs">
            <span>This file changed since you opened it.</span>
            <Button variant="outline" size="xs" onClick={showLatest}>
              <RefreshCwIcon data-icon="inline-start" />
              Show latest
            </Button>
          </div>
        )}
        <DiffView id={`${f.path}:${stale ? "held" : "latest"}`} patch={patch} more={more} empty={f.binary ? "Binary file: no text diff to show" : "No text diff (empty file)"} />
        <ReviewBar review={review} onReview={reviewShown} />
      </div>
      <aside aria-label="File and connected files" className="flex w-[clamp(calc(var(--spacing)*45),26%,calc(var(--spacing)*55))] shrink-0 flex-col gap-3 overflow-y-auto">
        <FileCard
          what="File"
          index={row.index}
          count={count}
          path={f.path}
          binary={f.binary}
          agent={f.words_agent}
          words={f.words}
          wordsLabel="before changing it"
          onStep={onStep}
          jump={
            inTimeline && (
              <Button variant="outline" size="icon-xs" aria-label="Show in Timeline" title="Show in Timeline" onClick={onShowInTimeline}>
                <ClockIcon />
              </Button>
            )
          }
        />
        <Connected title="Uses" paths={f.links_out} empty="Uses no changed files" rows={rows} onSelect={onSelect} />
        <Connected title="Used by" paths={f.links_in} empty="Used by no changed files" rows={rows} onSelect={onSelect} />
      </aside>
    </div>
  );
}

// Under the diff: this file's review state and the buttons that set it (A / X on the keyboard).
function ReviewBar({ review, onReview }: { review: ReviewState | null; onReview: (s: ReviewState | null) => void }) {
  return (
    <div className="mt-2 flex shrink-0 items-center justify-between gap-3" role="group" aria-label="Review this file">
      <span className={cn("text-xs text-faint", review === "approved" && "text-add", review === "rejected" && "text-rem")} aria-live="polite">
        {review === "approved" ? "Approved" : review === "rejected" ? "Rejected" : "Not reviewed"}
        {review && <span className="text-faint"> · resets if the agent changes this file</span>}
      </span>
      <ToggleGroup type="single" variant="outline" size="sm" value={review ?? ""} onValueChange={(v) => onReview((v || null) as ReviewState | null)}>
        <ToggleGroupItem value="approved" title="Approve (A)" className="data-[state=on]:bg-add-bg data-[state=on]:text-add">
          <CheckIcon data-icon="inline-start" />
          {review === "approved" ? "Approved" : "Approve"}
        </ToggleGroupItem>
        <ToggleGroupItem value="rejected" title="Reject (X)" className="data-[state=on]:bg-rem-bg data-[state=on]:text-rem">
          <XIcon data-icon="inline-start" />
          {review === "rejected" ? "Rejected" : "Reject"}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

// "Uses" / "Used by": changed files this one imports, and changed files that import it.
function Connected({ title, paths, empty, rows, onSelect }: { title: string; paths: string[]; empty: string; rows: Row[]; onSelect: (i: number) => void }) {
  const hits = paths.map((p) => rows.find((r) => r.file.path === p)).filter((r): r is Row => !!r);
  return (
    <MiniCard title={`${title} · ${hits.length}`} empty={empty}>
      {hits.map((r) => (
        <MiniRow key={r.index} onClick={() => onSelect(r.index)} title={`${r.file.path} · in ${r.group}`}>
          <span className="truncate font-mono font-medium">{base(r.file.path)}</span>
        </MiniRow>
      ))}
    </MiniCard>
  );
}
