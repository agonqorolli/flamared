import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AgentAvatar } from "@/components/AgentAvatar";
import { MiniCard, MiniRow } from "@/components/MiniCard";
import { Counts } from "@/components/StatusLetter";
import { base, plural, STATUS, SURVIVAL, type Survival } from "@/lib/format";
import type { Timeline } from "@/lib/timeline";
import type { FileInfo, Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { buildTree, squarify, type TreeNode } from "./treemap";

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
// Tile colors per lens. Data colors on a dark canvas, so they are set here rather than as theme tokens.
const LENS: Record<Lens, { label: string; color: (x: FileStats, M: Info) => string }> = {
  size: { label: "Change size", color: (x, M) => `hsl(218, 70%, ${20 + (40 * Math.log1p(x.f.add + x.f.rem)) / Math.log1p(M.maxLines)}%)` },
  rework: { label: "Rework", color: (x, M) => (x.edits ? `hsl(36, 85%, ${20 + (38 * x.edits) / M.maxEdits}%)` : "hsl(220, 10%, 28%)") },
  final: {
    label: "Still in final",
    color: (x) => {
      const s = keptShare(x.sv);
      return s == null ? "hsl(220, 10%, 26%)" : s >= 0.8 ? "hsl(135, 50%, 34%)" : s >= 0.4 ? "hsl(40, 70%, 38%)" : "#3A3F48";
    },
  },
  flags: { label: "Flags", color: (x) => (x.flags.length ? "#B4533A" : "hsl(220, 10%, 26%)") },
};

function Legend({ lens }: { lens: Lens }) {
  const sw = (c: string) => <span className="mr-1 ml-2 inline-block size-2.5 rounded-[2px] align-[-1px]" style={{ background: c }} />;
  if (lens === "size") return <>brighter = more lines changed</>;
  if (lens === "rework") return <>brighter = more agent edits · gray = no agent edits here</>;
  if (lens === "final")
    return (
      <>
        {sw("hsl(135,50%,34%)")}mostly in final{sw("hsl(40,70%,38%)")}partly{sw("#3A3F48")}mostly gone
      </>
    );
  return <>{sw("#B4533A")}flagged by a rule</>;
}

interface Props {
  snap: Snapshot;
  timeline: Timeline;
  active: boolean;
  onOpenInChanges: (path: string) => void;
  onShowInTimeline: (path: string) => void;
}

// Map: the whole repo as a treemap. The layout follows the folder tree (sized by file length), so it stays put
// day to day; changed files light up, colored by the chosen lens.
export function MapView({ snap, timeline, active, onOpenInChanges, onShowInTimeline }: Props) {
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

  return (
    <div className="flex min-h-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col px-4 pt-3.5 pb-4">
        <div className="flex flex-wrap items-center gap-3 pb-2.5">
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={lens} onValueChange={(v) => v && setLens(v as Lens)} aria-label="Color by">
            {(Object.keys(LENS) as Lens[]).map((k) => (
              <ToggleGroupItem key={k} value={k}>
                {LENS[k].label}
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
          <span className="text-[11px] text-faint">
            <Legend lens={lens} />
          </span>
        </div>
        <Treemap tree={tree} zoom={zoom} info={info} lens={lens} sel={sel} active={active} onSelect={select} onZoom={setZoom} />
      </main>
      <aside aria-label="Selected file" className="flex w-[300px] shrink-0 flex-col gap-3.5 overflow-y-auto border-l bg-sidebar px-4 py-4">
        {sel && info.files[sel] ? (
          <Selected x={info.files[sel]} inTimeline={timeline.paths.has(sel)} onBack={() => setSel(null)} onOpenInChanges={onOpenInChanges} onShowInTimeline={onShowInTimeline} />
        ) : (
          <Overview snap={snap} info={info} onSelect={select} />
        )}
      </aside>
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
      if (!x2) return void out.push(<div key={node.path} className="absolute rounded-[2px] border border-[#0B0C0F] bg-[#16181D]" style={st} title={`${node.path} · unchanged`} />);
      out.push(
        <button
          key={node.path}
          onClick={() => onSelect(node.path)}
          className={cn(
            "absolute flex items-start overflow-hidden rounded-[2px] border border-[#0B0C0F] px-1 py-0.5 text-left font-mono text-[10px] text-white hover:brightness-125",
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
        <div key={`d:${node.path}`} className="pointer-events-none absolute rounded border border-[#262A31]" style={st}>
          {labelled && (
            <button
              onClick={() => onZoom(node.path)}
              title={`Zoom into ${node.path}`}
              className="pointer-events-auto absolute inset-x-0.5 top-0 h-[15px] truncate px-1 text-left font-mono text-[10px] text-faint hover:text-foreground"
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
    <div ref={ref} role="img" aria-label="Treemap of the repository; changed files are lit up" className="relative min-h-80 flex-1 overflow-hidden rounded-xl border bg-[#0B0C0F]">
      {out}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <b className="text-right font-medium text-foreground">{children}</b>
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
      <div className="text-[10px] font-medium tracking-[.06em] text-faint uppercase">Overview</div>
      <Stat label="Changed files">
        {list.length} of {snap.map.files.length}
      </Stat>
      <Stat label="Folders touched">{folders.size}</Stat>
      <Stat label="Lines">
        <Counts add={snap.stats.add} rem={snap.stats.rem} />
      </Stat>
      <MiniCard title="Most changed" empty="">
        {top((x) => x.f.add + x.f.rem, 5).map((x) => row(x, <Counts add={x.f.add} rem={x.f.rem} />))}
      </MiniCard>
      <MiniCard title="Most reworked by agents" empty="No agent edits in this range">
        {top((x) => x.edits, 5).map((x) => row(x, plural(x.edits, "edit")))}
      </MiniCard>
      <MiniCard title="Flagged" empty="Nothing flagged">
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
      <Button variant="outline" size="xs" className="self-start" onClick={onBack}>
        <ArrowLeftIcon data-icon="inline-start" />
        Overview
      </Button>
      <div>
        <h3 className="font-mono text-[15px] font-semibold [overflow-wrap:anywhere]">{base(f.path)}</h3>
        <span className="font-mono text-[11px] break-all text-faint">{f.path}</span>
      </div>
      <Stat label="Status">{STATUS[f.status]}</Stat>
      <Stat label="Lines">{f.binary ? "binary" : <Counts add={f.add} rem={f.rem} />}</Stat>
      {x.group && (
        <Stat label="Group">
          <span className="font-mono">{x.group}</span>
        </Stat>
      )}
      <Stat label="Agent edits">{x.edits}</Stat>
      {x.edits > 0 && (
        <>
          <Stat label="Still in final">{s == null ? "—" : `${Math.round(s * 100)}%`}</Stat>
          <span className="-mt-2 text-[11px] text-faint">{svText}</span>
        </>
      )}
      {x.flags.length > 0 && (
        <Stat label="Flags">
          <span className="text-warn">{x.flags.join(", ")}</span>
        </Stat>
      )}
      {f.words && (
        <div className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
          <AgentAvatar agent={f.words_agent} className="mt-0.5" />
          <q>{f.words}</q>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="xs" onClick={() => onOpenInChanges(f.path)}>
          Open in Changes
        </Button>
        {inTimeline && (
          <Button variant="outline" size="xs" onClick={() => onShowInTimeline(f.path)}>
            Show in Timeline
          </Button>
        )}
      </div>
    </>
  );
}
