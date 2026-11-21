import { useEffect, useRef, useState } from "react";
import { base, plural, STATUS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type FileStats, type Lens, LENSES, type MapStats, type Relation, tileMark } from "./model";
import { squarify, type TreeNode } from "./tree";

// Sizes in px: the map is laid out in px, whatever the density.
const FOLDER_LABEL_HEIGHT = 15; // the room a folder's name takes above its tiles
const FOLDER_PADDING = 2; // between a folder's frame and its tiles
const LABELLED_FOLDER = { minWidth: 48, minHeight: 30 }; // a smaller folder gets no name
const NAMED_TILE = { minWidth: 44, minHeight: 16 }; // a smaller tile gets no file name
const NEW_CORNER = 8; // the folded corner of a new file: big enough to see on the smallest tiles
const DELETED_STRIPE = 4; // the width of a deleted file's stripes and of the gaps between them

// A deleted file's stripes, drawn over the lens color so that still reads.
const DELETED_STRIPES = `repeating-linear-gradient(135deg, transparent 0 ${DELETED_STRIPE}px, color-mix(in srgb, var(--lens-text) 35%, transparent) ${DELETED_STRIPE}px ${DELETED_STRIPE * 1.5}px)`;

// How a related file is described in its tile's hover text, after the selected file's name.
const RELATION: Record<Relation, string> = {
  usedBy: "used by",
  uses: "uses",
  group: "in the same group as",
};

// One thing to draw: a folder's frame or a file's tile.
interface Box {
  node: TreeNode;
  x: number;
  y: number;
  w: number;
  h: number;
  labelled: boolean; // a folder with room for its name
}

// The frames and tiles for `root` in a box of the given size, each folder before what is inside it.
function layout(root: TreeNode, width: number, height: number): Box[] {
  const boxes: Box[] = [];
  const place = (node: TreeNode, x: number, y: number, w: number, h: number, depth: number) => {
    if (w < 1 || h < 1) return;
    if (node.leaf) {
      boxes.push({ node, x, y, w, h, labelled: false });
      return;
    }
    // The folder being shown fills the map: it has no frame, name or padding of its own.
    const framed = depth > 0;
    const labelled = framed && w > LABELLED_FOLDER.minWidth && h > LABELLED_FOLDER.minHeight;
    const head = labelled ? FOLDER_LABEL_HEIGHT : 0;
    const pad = framed ? FOLDER_PADDING : 0;
    if (framed) boxes.push({ node, x, y, w, h, labelled });
    if (w - 2 * pad < 2 || h - head - 2 * pad < 2) return;
    const kids = [...node.kids.values()].sort((a, b) => b.size - a.size);
    for (const tile of squarify(kids, x + pad, y + head + pad, w - 2 * pad, h - head - 2 * pad)) {
      place(tile.node, tile.x, tile.y, tile.w, tile.h, depth + 1);
    }
  };
  place(root, 0, 0, width, height, 0);
  return boxes;
}

interface Props {
  tree: TreeNode;
  zoom: string; // the folder being shown; "" for the whole repo
  stats: MapStats;
  lens: Lens;
  selected: string | null;
  related: Map<string, Relation>; // changed files connected to the selected one
  dimmed: (path: string) => boolean; // changed files pushed back: not connected to the selection, or not in the prompt
  active: boolean;
  onSelect: (path: string) => void;
  onZoom: (path: string) => void;
}

// The repo drawn as nested boxes: folders as frames, files as tiles. Changed files are colored by the lens and can
// be selected; a folder's name zooms into it.
export function Treemap({ tree, zoom, stats, lens, selected, related, dimmed, active, onSelect, onZoom }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);

  let root = tree;
  for (const part of zoom ? zoom.split("/") : []) root = root.kids.get(part) ?? root;
  const boxes = size.w && size.h ? layout(root, size.w, size.h) : [];
  return (
    <div
      ref={ref}
      role="img"
      aria-label="Treemap of the repository; changed files are lit up"
      className="relative min-h-80 flex-1 overflow-hidden rounded-xl border bg-map-bg"
    >
      {boxes.map((box) => {
        const { node } = box;
        const place = { left: box.x, top: box.y, width: box.w, height: box.h };
        if (!node.leaf) {
          return (
            <FolderFrame key={`d:${node.path}`} node={node} place={place} labelled={box.labelled} onZoom={onZoom} />
          );
        }
        const file = stats.files[node.path];
        if (!file) {
          return (
            <div
              key={node.path}
              className="absolute rounded-[2px] border border-map-edge bg-map-tile"
              style={place}
              title={`${node.path} · unchanged`}
            />
          );
        }
        const relation = related.get(node.path);
        return (
          <ChangedTile
            key={node.path}
            node={node}
            file={file}
            place={place}
            color={LENSES[lens].color(file, stats)}
            selected={selected === node.path}
            relation={selected && relation ? `${RELATION[relation]} ${base(selected)}` : null}
            linked={relation === "uses" || relation === "usedBy"}
            groupOnly={relation === "group"}
            dim={dimmed(node.path)}
            named={box.w > NAMED_TILE.minWidth && box.h > NAMED_TILE.minHeight}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}

type Place = { left: number; top: number; width: number; height: number };

interface FolderFrameProps {
  node: TreeNode;
  place: Place;
  labelled: boolean;
  onZoom: (path: string) => void;
}

function FolderFrame({ node, place, labelled, onZoom }: FolderFrameProps) {
  return (
    <div className="pointer-events-none absolute rounded border border-map-folder" style={place}>
      {labelled && (
        <button
          onClick={() => onZoom(node.path)}
          title={`Zoom into ${node.path}`}
          className="pointer-events-auto absolute inset-x-0.5 top-0 truncate px-1 text-left font-mono text-micro text-faint hover:text-foreground"
          style={{ height: FOLDER_LABEL_HEIGHT }}
        >
          {node.name}
        </button>
      )}
    </div>
  );
}

interface ChangedTileProps {
  node: TreeNode;
  file: FileStats;
  place: Place;
  color: string;
  selected: boolean;
  relation: string | null; // how it connects to the selected file, for the hover text: "used by api.ts"
  linked: boolean; // imports the selected file or is imported by it
  groupOnly: boolean; // only in the same group as the selected file: half faded, behind the imports
  dim: boolean;
  named: boolean;
  onSelect: (path: string) => void;
}

function ChangedTile({
  node,
  file,
  place,
  color,
  selected,
  relation,
  linked,
  groupOnly,
  dim,
  named,
  onSelect,
}: ChangedTileProps) {
  const mark = tileMark(file.file);
  const title = [
    node.path,
    STATUS[file.file.status],
    `+${file.file.add} −${file.file.rem}`,
    plural(file.edits, "agent edit"),
    ...file.flags,
    relation,
  ].filter(Boolean);
  return (
    <button
      onClick={() => onSelect(node.path)}
      className={cn(
        "absolute flex items-start overflow-hidden rounded-[2px] border border-map-edge px-1 py-0.5 text-left font-mono text-micro text-lens-text transition-opacity hover:brightness-125",
        // Dashed white, so it shows on every lens color, and is told apart from the selection's solid line.
        linked && "z-10 outline-2 -outline-offset-2 outline-lens-text/80 outline-dashed",
        groupOnly && "opacity-60",
        selected && "z-10 outline-2 -outline-offset-2 outline-white",
        dim && "opacity-30 hover:opacity-70",
      )}
      style={{
        ...place,
        backgroundColor: color,
        backgroundImage: mark === "deleted" ? DELETED_STRIPES : undefined,
      }}
      title={title.join(" · ")}
    >
      {mark === "new" && <NewCorner />}
      {named && (
        <span className={cn("truncate [text-shadow:0_1px_2px_rgba(0,0,0,.6)]", mark === "new" && "pl-1")}>
          {node.name}
        </span>
      )}
    </button>
  );
}

// The folded top-left corner of a new file's tile.
export function NewCorner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("absolute top-0 left-0 bg-lens-text/80 [clip-path:polygon(0_0,100%_0,0_100%)]", className)}
      style={{ width: NEW_CORNER, height: NEW_CORNER }}
    />
  );
}

// A small sample of a deleted file's stripes, for the legend.
export const DELETED_SAMPLE = { backgroundImage: DELETED_STRIPES };
