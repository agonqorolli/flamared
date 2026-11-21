import { XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { KeyHint } from "@/components/KeyHint";
import { SideColumn } from "@/components/SideColumn";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { plural } from "@/lib/format";
import { hint, useKeys } from "@/lib/keys";
import type { Review } from "@/lib/review";
import { useSettings } from "@/lib/settings";
import type { PromptOnMap, Timeline } from "@/lib/timeline";
import type { Snapshot } from "@/lib/types";
import { FlagRules } from "./FlagRules";
import { LensPanel, Selected } from "./MapSide";
import { buildStats, CHECK_COLOR, type Lens, LENSES, type MapStats, relatedFiles, tileMark } from "./model";
import { buildTree } from "./tree";
import { DELETED_SAMPLE, NewCorner, Treemap } from "./Treemap";

interface Props {
  snap: Snapshot;
  timeline: Timeline;
  review: Review; // your marks, set in Changes
  active: boolean;
  focus: { path: string; n: number } | null; // "Show in Map" from another screen
  prompt: PromptOnMap | null; // a prompt's files to light up, from its card in Timeline
  onClearPrompt: () => void;
  onOpenInChanges: (path: string) => void;
  onShowInTimeline: (path: string) => void;
}

// Map: the whole repo as a treemap. The layout follows the folder tree (sized by file length), so it stays put
// day to day; changed files light up, colored by the chosen lens.
export function MapView({
  snap,
  timeline,
  review,
  active,
  focus,
  prompt,
  onClearPrompt,
  onOpenInChanges,
  onShowInTimeline,
}: Props) {
  const [lens, setLens] = useState<Lens>("size");
  const [zoom, setZoom] = useState(""); // the folder being shown; "" for the whole repo
  const [selected, setSelected] = useState<string | null>(null);
  const tree = useMemo(() => buildTree(snap.repo, snap.map.files), [snap]);
  const { stateOf, resetMarkOf } = review;
  const flagsOff = useSettings().settings.flags.off;
  const stats = useMemo(
    () => buildStats(snap, timeline, { stateOf, resetMarkOf }, flagsOff),
    [snap, timeline, stateOf, resetMarkOf, flagsOff],
  );
  // The selected file, while it is still one of the changed files, and the changed files connected to it.
  const picked = selected && stats.files[selected] ? selected : null;
  const related = useMemo(() => (picked ? relatedFiles(stats, picked) : new Map()), [stats, picked]);
  // Files outside the selection's connections, or outside the prompt being shown, step back.
  const dimmed = (path: string) =>
    (!!picked && path !== picked && !related.has(path)) || (!!prompt && !prompt.paths.has(path));
  const zoomParts = zoom ? zoom.split("/") : [];

  useEffect(() => {
    setZoom("");
    setSelected(null);
    onClearPrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.path]);

  const select = (path: string) => {
    setSelected(path);
    if (zoom && !path.startsWith(zoom + "/")) setZoom(""); // keep the selected tile on screen
  };
  // A jump from another screen selects its file. Only when a jump arrives, not when the files change.
  useEffect(() => {
    if (focus && stats.files[focus.path]) select(focus.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // 1–4 pick the lens, C / T jump to the selected file, Esc steps back: the lens's panel first, then the prompt,
  // then out of the zoom.
  const stepBack = () => {
    if (picked) setSelected(null);
    else if (prompt) onClearPrompt();
    else setZoom(zoomParts.slice(0, -1).join("/"));
  };
  useKeys(active, {
    lensSize: () => setLens("size"),
    lensChecks: () => setLens("checks"),
    lensReview: () => setLens("review"),
    lensFlags: () => setLens("flags"),
    toChanges: picked && (() => onOpenInChanges(picked)),
    toTimeline: picked && timeline.paths.has(picked) && (() => onShowInTimeline(picked)),
    back: (picked || prompt || zoom) && stepBack,
  });

  return (
    // The same 12px margin and side column as Changes and Timeline, so nothing jumps when switching screens.
    <div className="flex min-h-0 flex-1 gap-3 p-3">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 pb-2.5">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={lens}
            onValueChange={(value) => value && setLens(value as Lens)}
            aria-label="Color by"
          >
            {(Object.keys(LENSES) as Lens[]).map((id) => (
              <LensButton key={id} lens={id} stats={stats} />
            ))}
          </ToggleGroup>
          <nav aria-label="Folder" className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-xs text-faint">
            <Button variant="ghost" size="xs" className="font-mono" onClick={() => setZoom("")}>
              {snap.repo}
            </Button>
            {zoomParts.map((part, depth) => (
              <span key={depth} className="contents">
                /
                <Button
                  variant="ghost"
                  size="xs"
                  className="font-mono"
                  onClick={() => setZoom(zoomParts.slice(0, depth + 1).join("/"))}
                >
                  {part}
                </Button>
              </span>
            ))}
          </nav>
          {prompt && <PromptChip prompt={prompt} stats={stats} onClear={onClearPrompt} />}
          <span className="flex-1" />
          <span className="text-mini text-faint">
            <Legend lens={lens} stats={stats} />
          </span>
        </div>
        <Treemap
          tree={tree}
          zoom={zoom}
          stats={stats}
          lens={lens}
          selected={selected}
          related={related}
          dimmed={dimmed}
          active={active}
          onSelect={select}
          onZoom={setZoom}
        />
      </main>
      <SideColumn label={picked ? "Selected file" : `${LENSES[lens].label} overview`}>
        {picked ? (
          <Selected
            stats={stats.files[picked]}
            all={stats}
            inTimeline={timeline.paths.has(picked)}
            onBack={() => setSelected(null)}
            onSelect={select}
            onOpenInChanges={onOpenInChanges}
            onShowInTimeline={onShowInTimeline}
          />
        ) : (
          <LensPanel lens={lens} snap={snap} stats={stats} effects={timeline.effects} onSelect={select} />
        )}
      </SideColumn>
    </div>
  );
}

// A lens's button: its name, and how many files it asks you to look at.
function LensButton({ lens, stats }: { lens: Lens; stats: MapStats }) {
  const { label, key, needsLook, of } = LENSES[lens];
  const count = Object.values(stats.files).filter(needsLook).length;
  return (
    <ToggleGroupItem
      value={lens}
      title={`Color by ${label.toLowerCase()} (${hint(key)}) · ${plural(count, "file")} ${of}`}
    >
      {label}
      {count > 0 && (
        <span className="rounded-sm bg-foreground/10 px-1 font-mono text-micro text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
      <KeyHint id={key} />
    </ToggleGroupItem>
  );
}

// The prompt whose files are lit up, with a button to show every changed file again.
function PromptChip({ prompt, stats, onClear }: { prompt: PromptOnMap; stats: MapStats; onClear: () => void }) {
  const shown = [...prompt.paths].filter((path) => stats.files[path]).length;
  return (
    <span
      className="flex max-w-80 min-w-0 items-center gap-1.5 rounded-md bg-raised py-0.5 pr-0.5 pl-2 text-xs text-foreground"
      title={prompt.prompt}
    >
      <span className="shrink-0 font-medium">Prompt</span>
      <span className="min-w-0 truncate text-subtle">{prompt.prompt}</span>
      <span className="shrink-0 text-mini text-faint">{plural(shown, "file")}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Show every changed file again"
        title={`Show every changed file again (${hint("back")})`}
        onClick={onClear}
      >
        <XIcon />
      </Button>
    </span>
  );
}

// A small square of one of the map's colors.
function Swatch({ color }: { color: string }) {
  return <span className="mr-1 ml-2 inline-block size-2.5 rounded-[2px] align-[-1px]" style={{ background: color }} />;
}

// The marks for new and deleted files, when the change has any.
function MarkLegend({ stats }: { stats: MapStats }) {
  const marks = new Set(Object.values(stats.files).map((file) => tileMark(file.file)));
  return (
    <>
      {marks.has("new") && (
        <>
          <span className="relative mr-1 ml-2 inline-block size-2.5 rounded-[2px] bg-map-folder align-[-1px]">
            <NewCorner className="size-1.5" />
          </span>
          new
        </>
      )}
      {marks.has("deleted") && (
        <>
          <span
            className="mr-1 ml-2 inline-block size-2.5 rounded-[2px] bg-map-folder align-[-1px]"
            style={DELETED_SAMPLE}
          />
          deleted
        </>
      )}
    </>
  );
}

// What the colors of the chosen lens mean.
function Legend({ lens, stats }: { lens: Lens; stats: MapStats }) {
  return (
    <>
      <LensLegend lens={lens} />
      <MarkLegend stats={stats} />
    </>
  );
}

function LensLegend({ lens }: { lens: Lens }) {
  if (lens === "size") return <>stronger color = more lines changed</>;
  if (lens === "checks") {
    return (
      <>
        <Swatch color={CHECK_COLOR.tested} />
        tests passed
        <Swatch color={CHECK_COLOR.passed} />
        passed, no tests
        <Swatch color={CHECK_COLOR.failed} />
        failed
        <Swatch color={CHECK_COLOR.noChecks} />
        no checks
      </>
    );
  }
  if (lens === "review") {
    return (
      <>
        <Swatch color="var(--lens-approved)" />
        looks good
        <Swatch color="var(--lens-rejected)" />
        needs work
        <Swatch color="var(--lens-changed)" />
        changed since your mark
      </>
    );
  }
  return (
    <>
      <Swatch color="var(--lens-flag)" />
      flagged by a rule <FlagRules />
    </>
  );
}
