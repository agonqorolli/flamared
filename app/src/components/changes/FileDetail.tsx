import { CheckIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { DiffView } from "@/components/DiffView";
import { FileCard } from "@/components/FileCard";
import { JumpButton } from "@/components/JumpButton";
import { KeyHint } from "@/components/KeyHint";
import { MiniCard, MiniRow } from "@/components/MiniCard";
import { SideColumn } from "@/components/SideColumn";
import { StepButtons } from "@/components/StepButtons";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { base } from "@/lib/format";
import { hint, useKeys } from "@/lib/keys";
import type { ReviewState } from "@/lib/review";
import { cn } from "@/lib/utils";
import { type Row, toPatch } from "./model";

interface Props {
  row: Row;
  rows: Row[];
  active: boolean;
  diff: string;
  reviewOf: (diff: string) => ReviewState | null; // the mark for the version on screen
  inTimeline: boolean;
  onReview: (state: ReviewState | null, shown?: string) => void;
  onStep: (step: 1 | -1) => void;
  onSelect: (index: number) => void;
  onShowInTimeline: () => void;
  onShowInMap: () => void;
  onShowLatest: () => void;
}

// The selected file: its diff with the review bar under it, and beside it the file's card and connected files.
export function FileDetail({
  row,
  rows,
  active,
  diff,
  reviewOf,
  inTimeline,
  onReview,
  onStep,
  onSelect,
  onShowInTimeline,
  onShowInMap,
  onShowLatest,
}: Props) {
  const file = row.file;
  // The diff on screen holds still while you read: when the agent changes this file again, a bar offers the
  // newer version instead of swapping it in under you. Moving to another file always shows its latest.
  const [held, setHeld] = useState({ path: file.path, diff });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setHeld({ path: file.path, diff }), [file.path]);
  const shown = held.path === file.path ? held.diff : diff;
  const stale = shown !== diff;
  const review = reviewOf(shown);
  const showLatest = () => {
    setHeld({ path: file.path, diff });
    onShowLatest();
  };
  // G / W mark what is on screen "Looks good" or "Needs work", like the buttons.
  const reviewShown = (state: ReviewState | null) => onReview(state, stale ? shown : undefined);
  // Pressing it again clears it, like the pressed button.
  const mark = (state: ReviewState) => reviewShown(review === state ? null : state);
  useKeys(active, { looksGood: () => mark("approved"), needsWork: () => mark("rejected") });

  const hasTextDiff = !file.binary && shown.trim() !== "";
  const { patch, more } = hasTextDiff ? toPatch(file, shown) : { patch: null, more: null };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-3 p-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {stale && (
          <div
            role="status"
            className="mb-2 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-selection/40 bg-selection-bg px-3 py-1.5 text-xs"
          >
            <span>This file changed since you opened it.</span>
            <Button variant="outline" size="xs" onClick={showLatest}>
              <RefreshCwIcon data-icon="inline-start" />
              Show latest
            </Button>
          </div>
        )}
        <DiffView
          id={`${file.path}:${stale ? "held" : "latest"}`}
          patch={patch}
          more={more}
          empty={file.binary ? "Binary file: no text diff to show" : "No text diff (empty file)"}
        />
        <ReviewBar review={review} onReview={reviewShown} />
      </div>
      <SideColumn label="File and connected files">
        <StepButtons what="File" index={row.index} count={rows.length} onStep={onStep} />
        <FileCard
          what="File"
          index={row.index}
          count={rows.length}
          path={file.path}
          binary={file.binary}
          agent={file.words_agent}
          words={file.words}
          wordsLabel="before changing it"
          jump={
            <>
              {inTimeline && <JumpButton to="timeline" onClick={onShowInTimeline} />}
              <JumpButton to="map" onClick={onShowInMap} />
            </>
          }
        />
        <Connected title="Uses" paths={file.links_out} empty="Uses no changed files" rows={rows} onSelect={onSelect} />
        <Connected
          title="Used by"
          paths={file.links_in}
          empty="Used by no changed files"
          rows={rows}
          onSelect={onSelect}
        />
      </SideColumn>
    </div>
  );
}

const MARK_LABEL: Record<ReviewState, string> = { approved: "Looks good", rejected: "Needs work" };

// Under the diff: this file's mark and the buttons that set it (G / W on the keyboard). Plain words, not code-review
// terms: the mark is a note to yourself, and nothing is done to the code. Saved as "approved" / "rejected".
function ReviewBar({
  review,
  onReview,
}: {
  review: ReviewState | null;
  onReview: (state: ReviewState | null) => void;
}) {
  // The button of the active mark clears it.
  const title = (state: ReviewState) => (review === state ? "Clear the mark" : MARK_LABEL[state]);
  return (
    <div className="mt-2 flex shrink-0 items-center justify-between gap-3" role="group" aria-label="Review this file">
      <span
        className={cn("text-xs text-faint", review === "approved" && "text-add", review === "rejected" && "text-rem")}
        aria-live="polite"
      >
        {review ? MARK_LABEL[review] : "Not checked"}
        {review && <span className="text-faint"> · resets if the agent changes this file</span>}
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={review ?? ""}
        onValueChange={(value) => onReview((value || null) as ReviewState | null)}
      >
        <ToggleGroupItem
          value="approved"
          title={`${title("approved")} (${hint("looksGood")})`}
          className="data-[state=on]:bg-add-bg data-[state=on]:text-add"
        >
          <CheckIcon data-icon="inline-start" />
          Looks good
          <KeyHint id="looksGood" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="rejected"
          title={`${title("rejected")} (${hint("needsWork")})`}
          className="data-[state=on]:bg-rem-bg data-[state=on]:text-rem"
        >
          <XIcon data-icon="inline-start" />
          Needs work
          <KeyHint id="needsWork" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

interface ConnectedProps {
  title: string;
  paths: string[];
  empty: string;
  rows: Row[];
  onSelect: (index: number) => void;
}

// "Uses" / "Used by": changed files this one imports, and changed files that import it.
function Connected({ title, paths, empty, rows, onSelect }: ConnectedProps) {
  const connected = paths.map((path) => rows.find((row) => row.file.path === path)).filter((row) => row !== undefined);
  return (
    <MiniCard title={`${title} · ${connected.length}`} empty={empty}>
      {connected.map((row) => (
        <MiniRow key={row.index} onClick={() => onSelect(row.index)} title={`${row.file.path} · in ${row.group}`}>
          <span className="truncate font-mono font-medium">{base(row.file.path)}</span>
        </MiniRow>
      ))}
    </MiniCard>
  );
}
