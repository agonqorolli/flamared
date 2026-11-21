import type { ReactNode } from "react";
import { FileCard } from "@/components/FileCard";
import { JumpButton } from "@/components/JumpButton";
import { MiniCard, MiniRow } from "@/components/MiniCard";
import { Counts } from "@/components/StatusLetter";
import { checkLabel } from "@/components/timeline/CheckResult";
import { EffectIcon, effectTitle } from "@/components/timeline/EffectResult";
import { base, dir, plural, STATUS, SURVIVAL, type Survival, time } from "@/lib/format";
import type { EffectRun } from "@/lib/timeline";
import type { Snapshot } from "@/lib/types";
import { FlagRules } from "./FlagRules";
import {
  type CheckState,
  type FileStats,
  keptShare,
  type Lens,
  type MapStats,
  type MarkState,
  tileMark,
} from "./model";

// How many files the "Most changed" and "Most reworked" cards list.
const TOP_FILES = 5;
// How many of the latest commands the "Outside the diff" card lists; its title counts them all.
const TOP_EFFECTS = 6;
// How many files a list of a lens's panel shows before "N more".
const LIST_FILES = 12;

// Your mark on a file as said in the side panel, in the Reviewed lens's colors.
const MARK: Record<MarkState, { label: string; color: string }> = {
  approved: { label: "Looks good", color: "text-add" },
  rejected: { label: "Needs work", color: "text-rem" },
  changed: { label: "Changed since your mark", color: "text-selection" },
  none: { label: "Not reviewed", color: "text-faint" },
};

// A file's check state as said in the side panel, in the Tested lens's colors.
const CHECK_STATE: Record<CheckState, { label: string; color: string }> = {
  tested: { label: "Tests passed", color: "text-add" },
  passed: { label: "Passed, no tests", color: "text-subtle" },
  failed: { label: "Check failed", color: "text-rem" },
  noChecks: { label: "No checks", color: "text-warn" },
};

// A label and its value: one row of a card in the side panel, with an optional faint note under it.
function Stat({ label, note, children }: { label: ReactNode; note?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-1 py-1">
      {/* The value wraps under its label when the side column is dragged narrow. */}
      <div className="flex flex-wrap justify-between gap-x-2.5 text-xs text-muted-foreground">
        <span>{label}</span>
        <b className="ml-auto min-w-0 text-right font-medium [overflow-wrap:anywhere] text-foreground @max-[8rem]:max-w-full @max-[8rem]:truncate">
          {children}
        </b>
      </div>
      {note && <span className="text-mini text-faint">{note}</span>}
    </div>
  );
}

// A file's name with something about it on the right; clicking it selects the file on the map.
function FileLine({
  path,
  onSelect,
  children,
}: {
  path: string;
  onSelect: (path: string) => void;
  children?: ReactNode;
}) {
  return (
    <MiniRow onClick={() => onSelect(path)} title={path}>
      <span className="min-w-0 flex-1 truncate font-mono font-medium">{base(path)}</span>
      {children && <span className="shrink-0 text-faint">{children}</span>}
    </MiniRow>
  );
}

// A card listing some of the changed files, the first LIST_FILES of them, then how many more; nothing when empty.
function FileList({
  title,
  files,
  onSelect,
  about,
}: {
  title: ReactNode;
  files: FileStats[];
  onSelect: (path: string) => void;
  about?: (stats: FileStats) => ReactNode; // what the row says on the right
}) {
  if (!files.length) return null;
  const more = files.length - LIST_FILES;
  return (
    <MiniCard title={title}>
      {files.slice(0, LIST_FILES).map((stats) => (
        <FileLine key={stats.file.path} path={stats.file.path} onSelect={onSelect}>
          {about?.(stats)}
        </FileLine>
      ))}
      {more > 0 && <div className="px-1.5 py-1 text-mini text-faint">and {more} more</div>}
    </MiniCard>
  );
}

interface LensPanelProps {
  lens: Lens;
  snap: Snapshot;
  stats: MapStats;
  effects: EffectRun[]; // commands that changed things outside the diff, latest first
  onSelect: (path: string) => void;
}

// The side panel when no file is selected: what the chosen lens shows, and the files it asks you to look at.
export function LensPanel({ lens, snap, stats, effects, onSelect }: LensPanelProps) {
  const files = Object.values(stats.files);
  if (lens === "checks") return <TestedPanel files={files} onSelect={onSelect} />;
  if (lens === "review") return <ReviewedPanel files={files} onSelect={onSelect} />;
  if (lens === "flags") return <FlagsPanel files={files} onSelect={onSelect} />;
  return <SizePanel snap={snap} files={files} effects={effects} onSelect={onSelect} />;
}

// Change size: how big the change is, where it is biggest, where the agent went back most, and what it changed
// outside the diff.
function SizePanel({
  snap,
  files,
  effects,
  onSelect,
}: {
  snap: Snapshot;
  files: FileStats[];
  effects: EffectRun[];
  onSelect: (path: string) => void;
}) {
  const folders = new Set(files.map((stats) => dir(stats.file.path)));
  const marks = files.map((stats) => tileMark(stats.file));
  const added = marks.filter((mark) => mark === "new").length;
  const deleted = marks.filter((mark) => mark === "deleted").length;
  // The files with the most of something, leaving out the ones with none of it.
  const top = (amount: (stats: FileStats) => number) =>
    [...files]
      .sort((a, b) => amount(b) - amount(a))
      .filter((stats) => amount(stats) > 0)
      .slice(0, TOP_FILES);
  return (
    <>
      <MiniCard title="Overview">
        <Stat label="Changed files">
          {files.length} of {snap.map.files.length}
        </Stat>
        {(added > 0 || deleted > 0) && (
          <Stat label="New · deleted">
            {added} · {deleted}
          </Stat>
        )}
        <Stat label="Folders touched">{folders.size}</Stat>
        <Stat label="Lines">
          <Counts add={snap.stats.add} rem={snap.stats.rem} />
        </Stat>
      </MiniCard>
      <MiniCard title="Most changed">
        {top(({ file }) => file.add + file.rem).map(({ file }) => (
          <FileLine key={file.path} path={file.path} onSelect={onSelect}>
            <Counts add={file.add} rem={file.rem} />
          </FileLine>
        ))}
      </MiniCard>
      <MiniCard title="Most reworked by agents" empty="No agent edits in this range">
        {top(({ edits }) => edits).map(({ file, edits, survival }) => (
          <FileLine key={file.path} path={file.path} onSelect={onSelect}>
            {plural(edits, "edit")}
            {keptShare(survival) != null && ` · ${Math.round((keptShare(survival) ?? 0) * 100)}% kept`}
          </FileLine>
        ))}
      </MiniCard>
      <MiniCard
        title={`Outside the diff · ${effects.length}`}
        empty="No agent commands changed anything outside the diff"
      >
        {effects.slice(0, TOP_EFFECTS).map((run, k) => (
          <MiniRow key={k} title={effectTitle(run)}>
            <EffectIcon effects={run.effects} />
            <span className="min-w-0 flex-1 truncate font-mono text-mini">{run.effect_cmd}</span>
            <span className="shrink-0 text-faint">{time(run.at)}</span>
          </MiniRow>
        ))}
      </MiniCard>
    </>
  );
}

// Tested: how many edited code files had passing tests after the agent's last edit, then the ones that didn't,
// worst first.
function TestedPanel({ files, onSelect }: { files: FileStats[]; onSelect: (path: string) => void }) {
  const edited = files.filter((stats) => stats.check);
  const inState = (state: CheckState) => edited.filter((stats) => stats.check === state);
  const lastCheck = ({ lastCheck }: FileStats) => lastCheck && `${checkLabel(lastCheck.checks)} ${time(lastCheck.at)}`;
  return (
    <>
      <MiniCard title="After the agent's last edit" empty="No agent edits to code files">
        {edited.length > 0 && (
          <Stat label="Tests passed">
            {inState("tested").length} of {edited.length}
          </Stat>
        )}
        {(["failed", "noChecks", "passed"] as const).map(
          (state) =>
            inState(state).length > 0 && (
              <Stat key={state} label={<span className={CHECK_STATE[state].color}>{CHECK_STATE[state].label}</span>}>
                {inState(state).length}
              </Stat>
            ),
        )}
      </MiniCard>
      <FileList title="Check failed" files={inState("failed")} onSelect={onSelect} about={lastCheck} />
      <FileList title="No checks" files={inState("noChecks")} onSelect={onSelect} />
      <FileList title="Passed, no tests" files={inState("passed")} onSelect={onSelect} about={lastCheck} />
    </>
  );
}

// Reviewed: your progress, then what is left: the files you said need work, the ones changed since your mark, and
// the ones you haven't reviewed.
function ReviewedPanel({ files, onSelect }: { files: FileStats[]; onSelect: (path: string) => void }) {
  const withMark = (mark: MarkState) => files.filter((stats) => stats.mark === mark);
  const marked = withMark("approved").length + withMark("rejected").length;
  return (
    <>
      <MiniCard title="Your review">
        <Stat label="Reviewed">
          {marked} of {files.length}
        </Stat>
        {(["approved", "rejected", "changed"] as const).map(
          (mark) =>
            withMark(mark).length > 0 && (
              <Stat key={mark} label={<span className={MARK[mark].color}>{MARK[mark].label}</span>}>
                {withMark(mark).length}
              </Stat>
            ),
        )}
      </MiniCard>
      <FileList title="Needs work" files={withMark("rejected")} onSelect={onSelect} />
      <FileList
        title="Changed since your mark"
        files={withMark("changed")}
        onSelect={onSelect}
        about={({ markWas }) => markWas && `was ${MARK[markWas].label}`}
      />
      <FileList title="Not reviewed" files={withMark("none")} onSelect={onSelect} />
    </>
  );
}

// Flags: every flagged file with what flagged it.
function FlagsPanel({ files, onSelect }: { files: FileStats[]; onSelect: (path: string) => void }) {
  const flagged = files.filter(({ flags }) => flags.length);
  return (
    <MiniCard
      title={
        <span className="flex flex-wrap items-center gap-1">
          Flagged · {flagged.length} <FlagRules />
        </span>
      }
      empty="Nothing flagged"
    >
      {flagged.map(({ file, flags }) => (
        <MiniRow key={file.path} onClick={() => onSelect(file.path)} title={`${file.path} · ${flags.join(", ")}`}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-mono font-medium">{base(file.path)}</span>
            <span className="truncate text-mini text-warn">{flags.join(" · ")}</span>
          </span>
        </MiniRow>
      ))}
    </MiniCard>
  );
}

interface SelectedProps {
  stats: FileStats;
  all: MapStats;
  inTimeline: boolean;
  onBack: () => void;
  onSelect: (path: string) => void;
  onOpenInChanges: (path: string) => void;
  onShowInTimeline: (path: string) => void;
}

// The selected file: its card, what the map knows about it, and the changed files it connects to (lit up on the
// map).
export function Selected({
  stats,
  all,
  inTimeline,
  onBack,
  onSelect,
  onOpenInChanges,
  onShowInTimeline,
}: SelectedProps) {
  const { file, edits, survival, flags, group } = stats;
  const kept = keptShare(survival);
  // "2 in final · 1 partly rewritten"
  const survivalNote = (Object.entries(survival) as [Survival, number][])
    .filter(([, count]) => count)
    .map(([state, count]) => `${count} ${SURVIVAL[state].label}`)
    .join(" · ");
  const changed = (paths: string[]) => paths.filter((path) => all.files[path]).map((path) => all.files[path]);
  return (
    <>
      <FileCard
        what="File"
        path={file.path}
        binary={file.binary}
        agent={file.words_agent}
        words={file.words}
        wordsLabel="before changing it"
        onBack={onBack}
        jump={
          <>
            <JumpButton to="changes" verb="Open in" onClick={() => onOpenInChanges(file.path)} />
            {inTimeline && <JumpButton to="timeline" onClick={() => onShowInTimeline(file.path)} />}
          </>
        }
      />
      <MiniCard title="Details">
        <Stat label="Status">{STATUS[file.status]}</Stat>
        <Stat label="Lines">{file.binary ? "binary" : <Counts add={file.add} rem={file.rem} />}</Stat>
        {group && (
          <Stat label="Group">
            <span className="font-mono">{group}</span>
          </Stat>
        )}
        <Stat label="Agent edits">{edits}</Stat>
        {edits > 0 && (
          <Stat label="Still in final" note={survivalNote}>
            {kept == null ? "—" : `${Math.round(kept * 100)}%`}
          </Stat>
        )}
        {stats.check && (
          <Stat
            label="After the last edit"
            note={stats.lastCheck ? `${checkLabel(stats.lastCheck.checks)} at ${time(stats.lastCheck.at)}` : undefined}
          >
            <span className={CHECK_STATE[stats.check].color}>{CHECK_STATE[stats.check].label}</span>
          </Stat>
        )}
        <Stat label="Your mark" note={stats.markWas ? `was ${MARK[stats.markWas].label}` : undefined}>
          <span className={MARK[stats.mark].color}>{MARK[stats.mark].label}</span>
        </Stat>
        {flags.length > 0 && (
          <Stat label="Flags">
            <span className="text-warn">{flags.join(", ")}</span>
          </Stat>
        )}
      </MiniCard>
      <MiniCard title="Uses" empty="Uses no changed files">
        {changed(file.links_out).map((used) => (
          <FileLine key={used.file.path} path={used.file.path} onSelect={onSelect} />
        ))}
      </MiniCard>
      <MiniCard title="Used by" empty="Used by no changed files">
        {changed(file.links_in).map((user) => (
          <FileLine key={user.file.path} path={user.file.path} onSelect={onSelect} />
        ))}
      </MiniCard>
    </>
  );
}
