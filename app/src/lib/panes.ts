// Widths of the left list and the right side column after the person drags their edge. Until then the CSS
// defaults in index.css (--list-w, --side-w) apply; a dragged width replaces that variable on :root, so every
// screen still reads the same value and nothing jumps when switching. Saved in the app's data folder (store.ts).
import { getItem, removeItem, setItem } from "./store";

export type Pane = "list" | "side";

const VAR: Record<Pane, string> = { list: "--list-w", side: "--side-w" };
const KEY: Record<Pane, string> = { list: "pane.list", side: "pane.side" };
// Px limits; the max also leaves room for the diff in a narrow window. The side column can shrink until the file
// card holds just ↑↓: two icon-xs buttons (6 units each), the gap between (1), the card's padding (6) and its 1px
// border on each side. Spacing units change with density, so it is worked out from the current one.
const unit = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--spacing")) *
  parseFloat(getComputedStyle(document.documentElement).fontSize);
const MIN: Record<Pane, () => number> = { list: () => 150, side: () => Math.ceil(19 * unit() + 2) };
const MAX: Record<Pane, number> = { list: 560, side: 480 };

export const clampWidth = (pane: Pane, px: number) =>
  Math.round(Math.max(MIN[pane](), Math.min(px, MAX[pane], window.innerWidth * 0.4)));

export function setWidth(pane: Pane, px: number) {
  document.documentElement.style.setProperty(VAR[pane], `${clampWidth(pane, px)}px`);
}

export const saveWidth = (pane: Pane, px: number) => setItem(KEY[pane], String(clampWidth(pane, px)));

export function resetWidth(pane: Pane) {
  document.documentElement.style.removeProperty(VAR[pane]);
  removeItem(KEY[pane]);
}

// Call once at start, after the store is loaded.
export function applySavedWidths() {
  for (const pane of ["list", "side"] as Pane[]) {
    const px = Number(getItem(KEY[pane]));
    if (px > 0) setWidth(pane, px);
  }
}
