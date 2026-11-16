import { useEffect, useMemo, useRef, useState } from "react";
import { SideColumn } from "@/components/SideColumn";
import { ClockIcon, FileDiffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KeyHint } from "@/components/KeyHint";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MiniCard, MiniRow } from "@/components/MiniCard";
import { FileCard } from "@/components/FileCard";
import { Counts } from "@/components/StatusLetter";
import { base, plural, STATUS, SURVIVAL, type Survival } from "@/lib/format";
import type { Timeline } from "@/lib/timeline";
import type { FileInfo, Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { hint, useKeys, type KeyId } from "@/lib/keys";
import { buildTree, squarify, type TreeNode } from "./treemap";
import { FlagRules } from "./FlagRules";

type Lens = "size" | "rework" | "final" | "flags";
interface FileStats {
  f: FileInfo;
  edits: number;
  sv: Record<Survival, number>;
  flags: string[];
  group?: string;
}
interface Info {
  files: Record<string, FileStats>;
  maxLines: number;
  maxEdits: number;
}

const keptShare = (sv: Record<Survival, number>) => {
  const n = sv.kept + sv.partly + sv.gone + sv.undone;
  return n ? (sv.kept + sv.partly / 2) / n : null;
};
// Tile colors per lens, from the --lens-* tokens in index.css (each theme has its own). Scales mix a lens's low and
// high color by how much the file has of it.
const mix = (lens: "size" | "rework", t: number) => `color-mix(in srgb, var(--lens-${lens}-high) ${Math.round(t * 100)}%, var(--lens-${lens}-low))`;
const LENS: Record<Lens, { label: string; color: (x: FileStats, M: Info) => string }> = {
  size: { label: "Change size", color: (x, M) => mix("size", Math.log1p(x.f.add + x.f.rem) / Math.log1p(M.maxLines)) },
  rework: { label: "Rework", color: (x, M) => (x.edits ? mix("rework", x.edits / M.maxEdits) : "var(--lens-none)") },
  final: {
    label: "Still in final",
    color: (x) => {
      const s = keptShare(x.sv);
      return s == null ? "var(--lens-none)" : s >= 0.8 ? "var(--lens-kept)" : s >= 0.4 ? "var(--lens-partly)" : "var(--lens-gone)";
    },
  },
  flags: { label: "Flags", color: (x) => (x.flags.length ? "var(--lens-flag)" : "var(--lens-none)") },
};

const LENS_KEY: Record<Lens, KeyId> = { size: "lensSize", rework: "lensRework", final: "lensFinal", flags: "lensFlags" };

function Legend({ lens }: { lens: Lens }) {
  const sw = (c: string) => <span className="mr-1 ml-2 inline-block size-2.5 rounded-[2px] align-[-1px]" style={{ background: c }} />;
  if (lens === "size") return <>stronger color = more lines changed</>;
  if (lens === "rework") return <>stronger color = more agent edits · gray = no agent edits here</>;
  if (lens === "final")
    return (
      <>
        {sw("var(--lens-kept)")}mostly in final{sw("var(--lens-partly)")}partly{sw("var(--lens-gone)")}mostly gone
      </>
    );
  return (
    <>
      {sw("var(--lens-flag)")}flagged by a rule <FlagRules />
    </>
  );
}

interface Props {
  snap: Snapshot;
  timeline: Timeline;
  active: boolean;
  focus: { path: string; n: number } | null; // "Show in Map" from another screen
  onOpenInChanges: (path: string) => void;
  onShowInTimeline: (path: string) => void;
}

// Map: the whole repo as a treemap. The layout follows the folder tree (sized by file length), so it stays put
// day to day; changed files light up, colored by the chosen lens.
export function MapView({ snap, timeline, active, focus, onOpenInChanges, onShowInTimeline }: Props) {
  const [lens, setLens] = useState<Lens>("size");
  const [zoom, setZoom] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const tree = useMemo(() => buildTree(snap.repo, snap.map.files), [snap]);
  const info = useMemo<Info>(() => {
    const files: Record<string, FileStats> = {};
    const all = [
      ...snap.story.logic.flatMap((g) => [...g.files, ...g.tests]),
      ...[...snap.story.shared, ...snap.story.wiring, ...snap.story.loose.flatMap((l) => l.files)].flatMap((g) => [...g.files, ...g.tests]),
      ...snap.story.loose_tests,
      ...snap.story.support.flatMap((s) => s.files),
    ];
    for (const f of all) files[f.path] = { f, edits: 0, sv: { kept: 0, partly: 0, gone: 0, undone: 0 }, flags: snap.map.flags[f.path] || [], group: snap.map.groups[f.path] };
    for (const e of timeline.edits) {
      const x = files[e.path];
      if (!x) continue;
      x.edits++;
      if (e.survives) x.sv[e.survives]++;
    }
    const list = Object.values(files);
    return { files, maxLines: Math.max(1, ...list.map((x) => x.f.add + x.f.rem)), maxEdits: Math.max(1, ...list.map((x) => x.edits)) };
  }, [snap, timeline]);

  useEffect(() => {
    setZoom("");
    setSel(null);
  }, [snap.path]);

  const select = (p: string) => {
    setSel(p);
    if (zoom && !p.startsWith(zoom + "/")) setZoom(""); // keep the selected tile on screen
  };
  const parts = zoom ? zoom.split("/") : [];
  useEffect(() => {
    if (focus && info.files[focus.path]) select(focus.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  // 1–4 pick the lens, C / T jump to the selected file, Esc steps back: the overview first, then out of the zoom.
  const picked = sel && info.files[sel] ? sel : null;
  useKeys(active, {
    lensSize: () => setLens("size"),
    lensRework: () => setLens("rework"),
    lensFinal: () => setLens("final"),
    lensFlags: () => setLens("flags"),
    toChanges: picked && (() => onOpenInChanges(picked)),
    toTimeline: picked && timeline.paths.has(picked) && (() => onShowInTimeline(picked)),
    back: (picked || zoom) && (() => (picked ? setSel(null) : setZoom(parts.slice(0, -1).join("/")))),
  });

  return (
    // The same 12px margin and side column as Changes and Timeline, so nothing jumps when switching screens.
    <div className="flex min-h-0 flex-1 gap-3 p-3">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 pb-2.5">
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={lens} onValueChange={(v) => v && setLens(v as Lens)} aria-label="Color by">
            {(Object.keys(LENS) as Lens[]).map((k) => (
              <ToggleGroupItem key={k} value={k} title={`Color by ${LENS[k].label.toLowerCase()} (${hint(LENS_KEY[k])})`}>
                {LENS[k].label}
                <KeyHint id={LENS_KEY[k]} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <nav aria-label="Folder" className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-xs text-faint">
            <Button variant="ghost" size="xs" className="font-mono" onClick={() => setZoom("")}>
              {snap.repo}
            </Button>
            {parts.map((p, k) => (
              <span key={k} className="contents">
                /
                <Button variant="ghost" size="xs" className="font-mono" onClick={() => setZoom(parts.slice(0, k + 1).join("/"))}>
                  {p}
                </Button>
              </span>
            ))}
          </nav>
          <span className="flex-1" />
          <span className="text-mini text-faint">
            <Legend lens={lens} />
          </span>
        </div>
        <Treemap tree={tree} zoom={zoom} info={info} lens={lens} sel={sel} active={active} onSelect={select} onZoom={setZoom} />
      </main>
      <SideColumn label="Selected file">
        {sel && info.files[sel] ? (
          <Selected x={info.files[sel]} inTimeline={timeline.paths.has(sel)} onBack={() => setSel(null)} onOpenInChanges={onOpenInChanges} onShowInTimeline={onShowInTimeline} />
        ) : (
          <Overview snap={snap} info={info} onSelect={select} />
        )}
      </SideColumn>
    </div>
  );
}

function Treemap({ tree, zoom, info, lens, sel, active, onSelect, onZoom }: {
  tree: TreeNode;
  zoom: string;
  info: Info;
  lens: Lens;
  sel: string | null;
  active: boolean;
  onSelect: (p: string) => void;
  onZoom: (p: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  let root = tree;
  for (const part of zoom ? zoom.split("/") : []) root = root.kids.get(part) ?? root;
  const out: React.ReactNode[] = [];
  const draw = (node: TreeNode, x: number, y: number, w: number, h: number, depth: number) => {
    if (w < 1 || h < 1) return;
    const st = { left: x, top: y, width: w, height: h };
    if (node.leaf) {
      const x2 = info.files[node.path];
      if (!x2) return void out.push(<div key={node.path} className="absolute rounded-[2px] border border-map-edge bg-map-tile" style={st} title={`${node.path} · unchanged`} />);
      out.push(
        <button
          key={node.path}
          onClick={() => onSelect(node.path)}
          className={cn(
            "absolute flex items-start overflow-hidden rounded-[2px] border border-map-edge px-1 py-0.5 text-left font-mono text-micro text-lens-text hover:brightness-125",
            sel === node.path && "z-10 outline-2 -outline-offset-2 outline-white",
          )}
          style={{ ...st, background: LENS[lens].color(x2, info) }}
          title={`${node.path} · +${x2.f.add} −${x2.f.rem} · ${plural(x2.edits, "agent edit")}${x2.flags.length ? " · " + x2.flags.join(", ") : ""}`}
        >
          {w > 44 && h > 16 && <span className="truncate [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">{node.name}</span>}
        </button>,
      );
      return;
    }
    const labelled = depth > 0 && w > 48 && h > 30;
    const head = labelled ? 15 : 0;
    const pad = depth > 0 ? 2 : 0;
    if (depth > 0)
      out.push(
        <div key={`d:${node.path}`} className="pointer-events-none absolute rounded border border-map-folder" style={st}>
          {labelled && (
            <button
              onClick={() => onZoom(node.path)}
              title={`Zoom into ${node.path}`}
              className="pointer-events-auto absolute inset-x-0.5 top-0 h-[15px] truncate px-1 text-left font-mono text-micro text-faint hover:text-foreground"
            >
              {node.name}
            </button>
          )}
        </div>,
      );
    const kids = [...node.kids.values()].sort((a, b) => b.size - a.size);
    if (w - 2 * pad < 2 || h - head - 2 * pad < 2) return;
    for (const t of squarify(kids, x + pad, y + head + pad, w - 2 * pad, h - head - 2 * pad)) draw(t.node, t.x, t.y, t.w, t.h, depth + 1);
  };
  if (size.w && size.h) draw(root, 0, 0, size.w, size.h, 0);
  return (
    <div ref={ref} role="img" aria-label="Treemap of the repository; changed files are lit up" className="relative min-h-80 flex-1 overflow-hidden rounded-xl border bg-map-bg">
      {out}
    </div>
  );
}

// A label and its value: one row of a card in the side panel, with an optional faint note under it.
function Stat({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-1 py-1">
      <div className="flex justify-between gap-2.5 text-xs text-muted-foreground">
        <span>{label}</span>
        <b className="text-right font-medium text-foreground">{children}</b>
      </div>
      {note && <span className="text-mini text-faint">{note}</span>}
    </div>
  );
}

// The helicopter summary when nothing is selected.
function Overview({ snap, info, onSelect }: { snap: Snapshot; info: Info; onSelect: (p: string) => void }) {
  const list = Object.values(info.files);
  const folders = new Set(list.map((x) => x.f.path.split("/").slice(0, -1).join("/")));
  const top = (key: (x: FileStats) => number, n: number) => [...list].sort((a, b) => key(b) - key(a)).filter((x) => key(x) > 0).slice(0, n);
  const row = (x: FileStats, right: React.ReactNode) => (
    <MiniRow key={x.f.path} onClick={() => onSelect(x.f.path)} title={x.f.path}>
      <span className="min-w-0 flex-1 truncate font-mono font-medium">{base(x.f.path)}</span>
      <span className="shrink-0 text-faint">{right}</span>
    </MiniRow>
  );
  return (
    <>
      <MiniCard title="Overview" empty="">
        {[
          <Stat key="files" label="Changed files">
            {list.length} of {snap.map.files.length}
          </Stat>,
          <Stat key="folders" label="Folders touched">
            {folders.size}
          </Stat>,
          <Stat key="lines" label="Lines">
            <Counts add={snap.stats.add} rem={snap.stats.rem} />
          </Stat>,
        ]}
      </MiniCard>
      <MiniCard title="Most changed" empty="">
        {top((x) => x.f.add + x.f.rem, 5).map((x) => row(x, <Counts add={x.f.add} rem={x.f.rem} />))}
      </MiniCard>
      <MiniCard title="Most reworked by agents" empty="No agent edits in this range">
        {top((x) => x.edits, 5).map((x) => row(x, plural(x.edits, "edit")))}
      </MiniCard>
      <MiniCard
        title={
          <span className="flex items-center gap-1">
            Flagged <FlagRules />
          </span>
        }
        empty="Nothing flagged"
      >
        {list.filter((x) => x.flags.length).map((x) => row(x, <span className="text-warn">{x.flags[0]}</span>))}
      </MiniCard>
    </>
  );
}

function Selected({ x, inTimeline, onBack, onOpenInChanges, onShowInTimeline }: {
  x: FileStats;
  inTimeline: boolean;
  onBack: () => void;
  onOpenInChanges: (p: string) => void;
  onShowInTimeline: (p: string) => void;
}) {
  const f = x.f;
  const s = keptShare(x.sv);
  const svText = (Object.entries(x.sv) as [Survival, number][])
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${SURVIVAL[k][0]}`)
    .join(" · ");
  return (
    <>
      <FileCard
        what="File"
        path={f.path}
        binary={f.binary}
        agent={f.words_agent}
        words={f.words}
        wordsLabel="before changing it"
        onBack={onBack}
        jump={
          <>
            <Button variant="outline" size="icon-xs" aria-label="Open in Changes" title={`Open in Changes (${hint("toChanges")})`} onClick={() => onOpenInChanges(f.path)}>
              <FileDiffIcon />
              <KeyHint id="toChanges" />
            </Button>
            {inTimeline && (
              <Button variant="outline" size="icon-xs" aria-label="Show in Timeline" title={`Show in Timeline (${hint("toTimeline")})`} onClick={() => onShowInTimeline(f.path)}>
                <ClockIcon />
                <KeyHint id="toTimeline" />
              </Button>
            )}
          </>
        }
      />
      <MiniCard title="Details" empty="">
        {[
          <Stat key="status" label="Status">
            {STATUS[f.status]}
          </Stat>,
          <Stat key="lines" label="Lines">
            {f.binary ? "binary" : <Counts add={f.add} rem={f.rem} />}
          </Stat>,
          x.group && (
            <Stat key="group" label="Group">
              <span className="font-mono">{x.group}</span>
            </Stat>
          ),
          <Stat key="edits" label="Agent edits">
            {x.edits}
          </Stat>,
          x.edits > 0 && (
            <Stat key="kept" label="Still in final" note={svText}>
              {s == null ? "—" : `${Math.round(s * 100)}%`}
            </Stat>
          ),
          x.flags.length > 0 && (
            <Stat key="flags" label="Flags">
              <span className="text-warn">{x.flags.join(", ")}</span>
            </Stat>
          ),
        ]}
      </MiniCard>
    </>
  );
}
