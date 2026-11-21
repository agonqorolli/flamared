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
import { type CheckState, type FileStats, keptShare, type MapStats, type MarkState } from "./model";

// How many files the "Most changed" and "Most reworked" cards list.
const TOP_FILES = 5;
// How many of the latest commands the "Outside the diff" card lists; its title counts them all.
const TOP_EFFECTS = 6;

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
function Stat({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
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
  children: ReactNode;
}) {
  return (
    <MiniRow onClick={() => onSelect(path)} title={path}>
      <span className="min-w-0 flex-1 truncate font-mono font-medium">{base(path)}</span>
      <span className="shrink-0 text-faint">{children}</span>
    </MiniRow>
  );
}

interface OverviewProps {
  snap: Snapshot;
  stats: MapStats;
  effects: EffectRun[]; // commands that changed things outside the diff, latest first
  onSelect: (path: string) => void;
}

// The helicopter summary when nothing is selected.
export function Overview({ snap, stats, effects, onSelect }: OverviewProps) {
  const files = Object.values(stats.files);
  const folders = new Set(files.map((stats) => dir(stats.file.path)));
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
        <Stat label="Folders touched">{folders.size}</Stat>
        <Stat label="Lines">
          <Counts add={snap.stats.add} rem={snap.stats.rem} />
        </Stat>
        <TestedFiles files={files} />
        <ReviewedFiles files={files} />
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
      <MiniCard title="Most changed">
        {top(({ file }) => file.add + file.rem).map(({ file }) => (
          <FileLine key={file.path} path={file.path} onSelect={onSelect}>
            <Counts add={file.add} rem={file.rem} />
          </FileLine>
        ))}
      </MiniCard>
      <MiniCard title="Most reworked by agents" empty="No agent edits in this range">
        {top(({ edits }) => edits).map(({ file, edits }) => (
          <FileLine key={file.path} path={file.path} onSelect={onSelect}>
            {plural(edits, "edit")}
          </FileLine>
        ))}
      </MiniCard>
      <MiniCard
        title={
          <span className="flex flex-wrap items-center gap-1">
            Flagged <FlagRules />
          </span>
        }
        empty="Nothing flagged"
      >
        {files
          .filter(({ flags }) => flags.length)
          .map(({ file, flags }) => (
            <FileLine key={file.path} path={file.path} onSelect={onSelect}>
              <span className="text-warn">{flags[0]}</span>
            </FileLine>
          ))}
      </MiniCard>
    </>
  );
}

// How many of the files the agent edited had passing tests after their last edit, and what the rest had.
// How many changed files you marked (Looks good or Needs work), and how many of those need you again.
function ReviewedFiles({ files }: { files: FileStats[] }) {
  const count = (mark: MarkState) => files.filter((stats) => stats.mark === mark).length;
  const rest = [
    count("rejected") && `${count("rejected")} need work`,
    count("changed") && `${count("changed")} changed since your mark`,
  ].filter(Boolean);
  return (
    <Stat label="Reviewed" note={rest.join(" · ") || undefined}>
      {count("approved") + count("rejected")} of {files.length}
    </Stat>
  );
}

function TestedFiles({ files }: { files: FileStats[] }) {
  const edited = files.filter((stats) => stats.check);
  if (!edited.length) return null;
  const count = (state: CheckState) => edited.filter((stats) => stats.check === state).length;
  const rest = [
    count("passed") && `${count("passed")} passed without tests`,
    count("failed") && `${count("failed")} failed`,
    count("noChecks") && `${count("noChecks")} with no checks`,
  ].filter(Boolean);
  return (
    <Stat label="Tested after the last edit" note={rest.join(" · ") || undefined}>
      {count("tested")} of {edited.length}
    </Stat>
  );
}

interface SelectedProps {
  stats: FileStats;
  inTimeline: boolean;
  onBack: () => void;
  onOpenInChanges: (path: string) => void;
  onShowInTimeline: (path: string) => void;
}

// The selected file: its card, and what the map knows about it.
export function Selected({ stats, inTimeline, onBack, onOpenInChanges, onShowInTimeline }: SelectedProps) {
  const { file, edits, survival, flags, group } = stats;
  const kept = keptShare(survival);
  // "2 in final · 1 partly rewritten"
  const survivalNote = (Object.entries(survival) as [Survival, number][])
    .filter(([, count]) => count)
    .map(([state, count]) => `${count} ${SURVIVAL[state].label}`)
    .join(" · ");
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
    </>
  );
}
