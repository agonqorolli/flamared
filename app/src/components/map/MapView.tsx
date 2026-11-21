import { useEffect, useMemo, useState } from "react";
import { KeyHint } from "@/components/KeyHint";
import { SideColumn } from "@/components/SideColumn";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { hint, useKeys } from "@/lib/keys";
import type { Review } from "@/lib/review";
import { useSettings } from "@/lib/settings";
import type { Timeline } from "@/lib/timeline";
import type { Snapshot } from "@/lib/types";
import { FlagRules } from "./FlagRules";
import { Overview, Selected } from "./MapSide";
import { buildStats, CHECK_COLOR, type Lens, LENSES } from "./model";
import { buildTree } from "./tree";
import { Treemap } from "./Treemap";

interface Props {
  snap: Snapshot;
  timeline: Timeline;
  review: Review; // your marks, set in Changes
  active: boolean;
  focus: { path: string; n: number } | null; // "Show in Map" from another screen
  onOpenInChanges: (path: string) => void;
  onShowInTimeline: (path: string) => void;
}

// Map: the whole repo as a treemap. The layout follows the folder tree (sized by file length), so it stays put
// day to day; changed files light up, colored by the chosen lens.
export function MapView({ snap, timeline, review, active, focus, onOpenInChanges, onShowInTimeline }: Props) {
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
  // The selected file, while it is still one of the changed files.
  const picked = selected && stats.files[selected] ? selected : null;
  const zoomParts = zoom ? zoom.split("/") : [];

  useEffect(() => {
    setZoom("");
    setSelected(null);
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

  // 1–6 pick the lens, C / T jump to the selected file, Esc steps back: the overview first, then out of the zoom.
  const stepBack = () => {
    if (picked) setSelected(null);
    else setZoom(zoomParts.slice(0, -1).join("/"));
  };
  useKeys(active, {
    lensSize: () => setLens("size"),
    lensRework: () => setLens("rework"),
    lensFinal: () => setLens("final"),
    lensFlags: () => setLens("flags"),
    lensChecks: () => setLens("checks"),
    lensReview: () => setLens("review"),
    toChanges: picked && (() => onOpenInChanges(picked)),
    toTimeline: picked && timeline.paths.has(picked) && (() => onShowInTimeline(picked)),
    back: (picked || zoom) && stepBack,
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
              <ToggleGroupItem
                key={id}
                value={id}
                title={`Color by ${LENSES[id].label.toLowerCase()} (${hint(LENSES[id].key)})`}
              >
                {LENSES[id].label}
                <KeyHint id={LENSES[id].key} />
              </ToggleGroupItem>
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
          <span className="flex-1" />
          <span className="text-mini text-faint">
            <Legend lens={lens} />
          </span>
        </div>
        <Treemap
          tree={tree}
          zoom={zoom}
          stats={stats}
          lens={lens}
          selected={selected}
          active={active}
          onSelect={select}
          onZoom={setZoom}
        />
      </main>
      <SideColumn label="Selected file">
        {picked ? (
          <Selected
            stats={stats.files[picked]}
            inTimeline={timeline.paths.has(picked)}
            onBack={() => setSelected(null)}
            onOpenInChanges={onOpenInChanges}
            onShowInTimeline={onShowInTimeline}
          />
        ) : (
          <Overview snap={snap} stats={stats} effects={timeline.effects} onSelect={select} />
        )}
      </SideColumn>
    </div>
  );
}

// A small square of one of the map's colors.
function Swatch({ color }: { color: string }) {
  return <span className="mr-1 ml-2 inline-block size-2.5 rounded-[2px] align-[-1px]" style={{ background: color }} />;
}

// What the colors of the chosen lens mean.
function Legend({ lens }: { lens: Lens }) {
  if (lens === "size") return <>stronger color = more lines changed</>;
  if (lens === "rework") return <>stronger color = more agent edits · gray = no agent edits here</>;
  if (lens === "final") {
    return (
      <>
        <Swatch color="var(--lens-kept)" />
        mostly in final
        <Swatch color="var(--lens-partly)" />
        partly
        <Swatch color="var(--lens-gone)" />
        mostly gone
      </>
    );
  }
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
