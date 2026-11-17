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
  for (const [p, n] of files) {
    const parts = p.split("/");
    let node = root;
    for (let k = 0; k < parts.length - 1; k++) {
      if (!node.kids.has(parts[k])) node.kids.set(parts[k], { name: parts[k], path: parts.slice(0, k + 1).join("/"), size: 0, kids: new Map() });
      node = node.kids.get(parts[k])!;
    }
    // Square root of the line count: huge data files (timings, lockfiles) don't swallow the map.
    node.kids.set(parts[parts.length - 1], { name: parts[parts.length - 1], path: p, leaf: true, size: Math.sqrt(Math.max(1, n)), kids: new Map() });
  }
  const sum = (n: TreeNode): number => (n.leaf ? n.size : (n.size = [...n.kids.values()].reduce((a, c) => a + sum(c), 0)));
  sum(root);
  return root;
}

export interface Tile {
  node: TreeNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Squarified treemap (Bruls et al.): rows of tiles kept as close to square as possible.
export function squarify(items: TreeNode[], x: number, y: number, w: number, h: number): Tile[] {
  const total = items.reduce((a, c) => a + c.size, 0);
  if (!total) return [];
  const scale = (w * h) / total;
  const todo = items.map((c) => ({ c, a: c.size * scale }));
  const out: Tile[] = [];
  let row: typeof todo = [];
  const worst = (r: typeof todo, side: number) => {
    const s = r.reduce((a, b) => a + b.a, 0);
    const mx = Math.max(...r.map((b) => b.a));
    const mn = Math.min(...r.map((b) => b.a));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const place = (r: typeof todo) => {
    const s = r.reduce((a, b) => a + b.a, 0);
    if (w >= h) {
      const rw = s / h;
      let yy = y;
      for (const b of r) {
        out.push({ node: b.c, x, y: yy, w: rw, h: b.a / rw });
        yy += b.a / rw;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = s / w;
      let xx = x;
      for (const b of r) {
        out.push({ node: b.c, x: xx, y, w: b.a / rh, h: rh });
        xx += b.a / rh;
      }
      y += rh;
      h -= rh;
    }
  };
  while (todo.length) {
    const side = Math.min(w, h);
    const next = todo[0];
    if (!row.length || worst([...row, next], side) <= worst(row, side)) {
      row.push(todo.shift()!);
    } else {
      place(row);
      row = [];
    }
  }
  if (row.length) place(row);
  return out;
}
