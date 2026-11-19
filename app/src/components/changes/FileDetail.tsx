import { CheckIcon, ChevronsDownIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { DiffView } from "@/components/DiffView";
import { FileCard } from "@/components/FileCard";
import { JumpButton } from "@/components/JumpButton";
import { KeyHint } from "@/components/KeyHint";
import { MiniCard, MiniRow } from "@/components/MiniCard";
import { SideColumn } from "@/components/SideColumn";
import { StepButtons } from "@/components/StepButtons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Delta } from "@/lib/delta";
import { base, plural } from "@/lib/format";
import { hint, useKeys } from "@/lib/keys";
import type { ReviewState } from "@/lib/review";
import { cn } from "@/lib/utils";
import { type Row, toPatch } from "./model";
import { useWholeDiff, type WholeDiff } from "./useWholeDiff";

interface Props {
  row: Row;
  rows: Row[];
  active: boolean;
  diff: string;
  reviewOf: (diff: string) => ReviewState | null; // the mark for the version on screen
  changedSince: (diff: string) => { was: ReviewState; delta: Delta } | null; // what is new since a reset mark
  loadWhole: ((path: string) => Promise<string>) | null; // a file's whole diff, for Show all; null in the preview
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
  changedSince,
  loadWhole,
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
  const since = changedSince(shown);
  const showLatest = () => {
    setHeld({ path: file.path, diff });
    onShowLatest();
  };
  // G / W mark what is on screen "Looks good" or "Needs work", like the buttons.
  const reviewShown = (state: ReviewState | null) => onReview(state, stale ? shown : undefined);
  // Pressing it again clears it, like the pressed button.
  const mark = (state: ReviewState) => reviewShown(review === state ? null : state);
  useKeys(active, { looksGood: () => mark("approved"), needsWork: () => mark("rejected") });

  const whole = useWholeDiff(file.path, shown, loadWhole ?? noWholeDiff);
  const hasTextDiff = !file.binary && shown.trim() !== "";
  const patch = hasTextDiff ? toPatch(file, whole.text) : null;
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
        {since && <ChangedSince was={since.was} delta={since.delta} />}
        <DiffView
          id={`${file.path}:${stale ? "held" : "latest"}`}
          patch={patch}
          footer={whole.left !== null && <CutNote whole={whole} canLoad={!!loadWhole} />}
          newLines={since?.delta}
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

// In the browser preview there is no Rust side to ask.
const noWholeDiff = () => Promise.reject(new Error("The whole diff is read in the app, not in this preview."));

// Under a diff cut at 2,000 lines: how many lines are left out, and Show all to load and draw them.
function CutNote({ whole, canLoad }: { whole: WholeDiff; canLoad: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-xs text-faint">
      <span className={cn(whole.error && "text-destructive")}>
        {whole.error ?? `${plural(whole.left ?? 0, "more line")} not shown`}
      </span>
      {canLoad && (
        <Button variant="outline" size="xs" onClick={whole.showAll} disabled={whole.loading}>
          {whole.loading ? <Spinner data-icon="inline-start" /> : <ChevronsDownIcon data-icon="inline-start" />}
          Show all
        </Button>
      )}
    </div>
  );
}

const MARK_LABEL: Record<ReviewState, string> = { approved: "Looks good", rejected: "Needs work" };
const MARK_COLOR: Record<ReviewState, string> = { approved: "text-add", rejected: "text-rem" };

// Above the diff of a file whose mark was reset by a newer change: how much is new since you marked it. The new
// lines carry a bar in the same color in the diff, so you can read just those and mark the file again.
function ChangedSince({ was, delta }: { was: ReviewState; delta: Delta }) {
  return (
    <div role="status" className="mb-2 flex shrink-0 items-center gap-2 px-1 text-xs text-subtle">
      <span className="h-3.5 w-0.75 shrink-0 rounded-full bg-selection" aria-hidden />
      <span>
        {whatChanged(delta)} since you marked it <span className={MARK_COLOR[was]}>{MARK_LABEL[was]}</span>
      </span>
    </div>
  );
}

// "12 lines changed", or when nothing new was added but lines you saw were taken out, how many.
function whatChanged({ added, removed, gone }: Delta) {
  const fresh = added.length + removed.length;
  if (fresh) return `${plural(fresh, "line")} changed`;
  if (gone) return `${plural(gone, "line")} you saw ${gone === 1 ? "was" : "were"} taken out`;
  return "Changed";
}

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
      <span className={cn("text-xs text-faint", review && MARK_COLOR[review])} aria-live="polite">
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
