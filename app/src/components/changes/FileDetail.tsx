import { useState } from "react";
import { PatchDiff } from "@pierre/diffs/react";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AgentAvatar } from "@/components/AgentAvatar";
import { base, dir } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReviewState } from "@/lib/review";
import type { FileInfo } from "@/lib/types";
import { toPatch, type Row } from "./model";

interface Props {
  row: Row;
  count: number;
  diff: string;
  rows: Row[];
  review: ReviewState | null;
  onReview: (s: ReviewState | null) => void;
  onStep: (dir: 1 | -1) => void;
  onSelect: (i: number) => void;
}

export function FileDetail({ row, count, diff, rows, review, onReview, onStep, onSelect }: Props) {
  const f = row.file;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-3 px-6 pt-2.5 pb-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DiffCard file={f} diff={diff} />
        <ReviewBar review={review} onReview={onReview} />
      </div>
      <aside aria-label="File and connected files" className="flex w-[clamp(180px,26%,220px)] shrink-0 flex-col gap-3 overflow-y-auto">
        <FileCard row={row} count={count} onStep={onStep} />
        <Connected title="Uses" paths={f.links_out} empty="Uses no changed files" rows={rows} onSelect={onSelect} />
        <Connected title="Used by" paths={f.links_in} empty="Used by no changed files" rows={rows} onSelect={onSelect} />
      </aside>
    </div>
  );
}

function DiffCard({ file, diff }: { file: FileInfo; diff: string }) {
  if (file.binary || !diff.trim()) {
    return (
      <div className="flex h-24 shrink-0 items-center rounded-xl border bg-card px-6 text-sm text-faint">
        {file.binary ? "Binary file: no text diff to show" : "No text diff (empty file)"}
      </div>
    );
  }
  const { patch, more } = toPatch(file, diff);
  return (
    <div className="min-h-0 shrink overflow-auto rounded-xl border bg-card">
      <PatchDiff
        key={file.path}
        patch={patch}
        options={{ theme: "pierre-dark", themeType: "dark", diffStyle: "unified", disableFileHeader: true, overflow: "scroll" }}
      />
      {more && <div className="border-t px-4 py-2 text-xs text-faint">{more}</div>}
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
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={review ?? ""}
        onValueChange={(v) => onReview((v || null) as ReviewState | null)}
      >
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

// The head of the right column: which file of how many, ↑↓, the file, and the agent's last message before it.
function FileCard({ row, count, onStep }: { row: Row; count: number; onStep: (dir: 1 | -1) => void }) {
  const f = row.file;
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="File" className="flex flex-col gap-2.5 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-1.5">
        <span className="flex-1 text-[10px] font-medium tracking-[.06em] text-faint uppercase">
          File <b className="text-foreground">{row.index + 1}</b> of {count}
        </span>
        <Button variant="outline" size="icon-xs" aria-label="Previous file" title="Previous file (K)" disabled={row.index <= 0} onClick={() => onStep(-1)}>
          <ArrowUpIcon />
        </Button>
        <Button variant="outline" size="icon-xs" aria-label="Next file" title="Next file (J)" disabled={row.index >= count - 1} onClick={() => onStep(1)}>
          <ArrowDownIcon />
        </Button>
      </div>
      <div title={f.path} className="min-w-0">
        <h2 className="font-mono text-sm font-medium [overflow-wrap:anywhere]">{base(f.path)}</h2>
        {dir(f.path) && (
          <div className="truncate font-mono text-[11px] text-faint [direction:rtl] text-left">
            <bdi>{dir(f.path)}</bdi>
          </div>
        )}
      </div>
      {f.binary && <div className="text-xs text-faint">Binary file</div>}
      {f.words && (
        <button className="flex flex-col gap-1 text-left" title="Click to show the whole message" onClick={() => setOpen(!open)}>
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-ai-foreground">
            <AgentAvatar agent={f.words_agent} />
            <span className="truncate">
              {f.words_agent ?? "Agent"} <em className="text-faint not-italic">· before changing it</em>
            </span>
          </span>
          <q className={cn("text-xs leading-snug text-muted-foreground", !open && "line-clamp-4")}>{f.words}</q>
        </button>
      )}
    </section>
  );
}

// "Uses" / "Used by": changed files this one imports, and changed files that import it.
function Connected({ title, paths, empty, rows, onSelect }: { title: string; paths: string[]; empty: string; rows: Row[]; onSelect: (i: number) => void }) {
  const hits = paths.map((p) => rows.find((r) => r.file.path === p)).filter((r): r is Row => !!r);
  return (
    <section aria-label={title} className="flex flex-col gap-1 rounded-xl border bg-card p-2">
      <div className="px-1 pb-0.5 text-[10px] font-medium tracking-[.06em] text-faint uppercase">
        {title} · {hits.length}
      </div>
      {hits.length ? (
        hits.map((r) => (
          <button
            key={r.index}
            onClick={() => onSelect(r.index)}
            title={`${r.file.path} · in ${r.group}`}
            className="truncate rounded-md px-1.5 py-1 text-left font-mono text-xs font-medium text-subtle hover:bg-raised"
          >
            {base(r.file.path)}
          </button>
        ))
      ) : (
        <div className="px-1 pb-1 text-xs text-faint">{empty}</div>
      )}
    </section>
  );
}
