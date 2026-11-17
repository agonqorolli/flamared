import { useEffect, useRef, useState } from "react";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type FileStats, type Lens, LENSES, type MapStats } from "./model";
import { squarify, type TreeNode } from "./tree";

// Sizes in px: the map is laid out in px, whatever the density.
const FOLDER_LABEL_HEIGHT = 15; // the room a folder's name takes above its tiles
const FOLDER_PADDING = 2; // between a folder's frame and its tiles
const LABELLED_FOLDER = { minWidth: 48, minHeight: 30 }; // a smaller folder gets no name
const NAMED_TILE = { minWidth: 44, minHeight: 16 }; // a smaller tile gets no file name

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
  active: boolean;
  onSelect: (path: string) => void;
  onZoom: (path: string) => void;
}

// The repo drawn as nested boxes: folders as frames, files as tiles. Changed files are colored by the lens and can
// be selected; a folder's name zooms into it.
export function Treemap({ tree, zoom, stats, lens, selected, active, onSelect, onZoom }: Props) {
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
        return (
          <ChangedTile
            key={node.path}
            node={node}
            file={file}
            place={place}
            color={LENSES[lens].color(file, stats)}
            selected={selected === node.path}
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
  named: boolean;
  onSelect: (path: string) => void;
}

function ChangedTile({ node, file, place, color, selected, named, onSelect }: ChangedTileProps) {
  const flags = file.flags.length ? " · " + file.flags.join(", ") : "";
  return (
    <button
      onClick={() => onSelect(node.path)}
      className={cn(
        "absolute flex items-start overflow-hidden rounded-[2px] border border-map-edge px-1 py-0.5 text-left font-mono text-micro text-lens-text hover:brightness-125",
        selected && "z-10 outline-2 -outline-offset-2 outline-white",
      )}
      style={{ ...place, background: color }}
      title={`${node.path} · +${file.file.add} −${file.file.rem} · ${plural(file.edits, "agent edit")}${flags}`}
    >
      {named && <span className="truncate [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">{node.name}</span>}
    </button>
  );
}
