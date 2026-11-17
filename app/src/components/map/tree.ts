// The whole repo as a folder tree sized by file length, laid out as a squarified treemap.

export interface TreeNode {
  name: string;
  path: string;
  size: number;
  leaf?: boolean;
  kids: Map<string, TreeNode>;
}

export function buildTree(repo: string, files: [string, number][]): TreeNode {
  const root: TreeNode = { name: repo, path: "", size: 0, kids: new Map() };
  for (const [path, lines] of files) {
    const parts = path.split("/");
    const name = parts[parts.length - 1];
    let folder = root;
    for (let depth = 0; depth < parts.length - 1; depth++) {
      let next = folder.kids.get(parts[depth]);
      if (!next) {
        next = { name: parts[depth], path: parts.slice(0, depth + 1).join("/"), size: 0, kids: new Map() };
        folder.kids.set(parts[depth], next);
      }
      folder = next;
    }
    // Square root of the line count: huge data files (timings, lockfiles) don't swallow the map.
    folder.kids.set(name, { name, path, leaf: true, size: Math.sqrt(Math.max(1, lines)), kids: new Map() });
  }
  // A folder is as big as everything in it.
  const measure = (node: TreeNode): number => {
    if (!node.leaf) node.size = [...node.kids.values()].reduce((sum, kid) => sum + measure(kid), 0);
    return node.size;
  };
  measure(root);
  return root;
}

export interface Tile {
  node: TreeNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Squarified treemap (Bruls et al.): rows of tiles kept as close to square as possible. The items fill the box at
// (x, y) of size w × h, each with an area in proportion to its size.
export function squarify(items: TreeNode[], x: number, y: number, w: number, h: number): Tile[] {
  const total = items.reduce((sum, item) => sum + item.size, 0);
  if (!total) return [];
  const scale = (w * h) / total;
  const todo = items.map((node) => ({ node, area: node.size * scale }));
  type Sized = (typeof todo)[number];
  const tiles: Tile[] = [];
  let row: Sized[] = [];
  // How far from square the worst tile of a row is, when the row lies along a side of that length.
  const worst = (candidates: Sized[], side: number) => {
    const sum = candidates.reduce((a, b) => a + b.area, 0);
    const largest = Math.max(...candidates.map((sized) => sized.area));
    const smallest = Math.min(...candidates.map((sized) => sized.area));
    return Math.max((side * side * largest) / (sum * sum), (sum * sum) / (side * side * smallest));
  };
  // Lays a row along the shorter side of the space that is left, and takes its strip out of that space.
  const place = (placed: Sized[]) => {
    const sum = placed.reduce((a, b) => a + b.area, 0);
    if (w >= h) {
      const stripWidth = sum / h;
      let top = y;
      for (const { node, area } of placed) {
        tiles.push({ node, x, y: top, w: stripWidth, h: area / stripWidth });
        top += area / stripWidth;
      }
      x += stripWidth;
      w -= stripWidth;
    } else {
      const stripHeight = sum / w;
      let left = x;
      for (const { node, area } of placed) {
        tiles.push({ node, x: left, y, w: area / stripHeight, h: stripHeight });
        left += area / stripHeight;
      }
      y += stripHeight;
      h -= stripHeight;
    }
  };
  while (todo.length) {
    const side = Math.min(w, h);
    const next = todo[0];
    // Take the next item into the row as long as that doesn't make the row's tiles less square.
    if (!row.length || worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
      todo.shift();
    } else {
      place(row);
      row = [];
    }
  }
  if (row.length) place(row);
  return tiles;
}
