import { CheckIcon, ClockIcon, XIcon } from "lucide-react";
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
  count: number;
  diff: string;
  rows: Row[];
  review: ReviewState | null;
  inTimeline: boolean;
  onReview: (s: ReviewState | null) => void;
  onStep: (dir: 1 | -1) => void;
  onSelect: (i: number) => void;
  onShowInTimeline: () => void;
}

export function FileDetail({ row, count, diff, rows, review, inTimeline, onReview, onStep, onSelect, onShowInTimeline }: Props) {
  const f = row.file;
  const { patch, more } = f.binary || !diff.trim() ? { patch: null, more: null } : toPatch(f, diff);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-3 px-6 pt-2.5 pb-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DiffView id={f.path} patch={patch} more={more} empty={f.binary ? "Binary file: no text diff to show" : "No text diff (empty file)"} />
        <ReviewBar review={review} onReview={onReview} />
      </div>
      <aside aria-label="File and connected files" className="flex w-[clamp(180px,26%,220px)] shrink-0 flex-col gap-3 overflow-y-auto">
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
