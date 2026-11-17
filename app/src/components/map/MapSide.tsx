import type { ReactNode } from "react";
import { FileCard } from "@/components/FileCard";
import { JumpButton } from "@/components/JumpButton";
import { MiniCard, MiniRow } from "@/components/MiniCard";
import { Counts } from "@/components/StatusLetter";
import { base, dir, plural, STATUS, SURVIVAL, type Survival } from "@/lib/format";
import type { Snapshot } from "@/lib/types";
import { FlagRules } from "./FlagRules";
import { type FileStats, keptShare, type MapStats } from "./model";

// How many files the "Most changed" and "Most reworked" cards list.
const TOP_FILES = 5;

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
  onSelect: (path: string) => void;
}

// The helicopter summary when nothing is selected.
export function Overview({ snap, stats, onSelect }: OverviewProps) {
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
        {flags.length > 0 && (
          <Stat label="Flags">
            <span className="text-warn">{flags.join(", ")}</span>
          </Stat>
        )}
      </MiniCard>
    </>
  );
}
