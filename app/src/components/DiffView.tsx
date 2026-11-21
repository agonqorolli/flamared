import { type CodeViewItem, parsePatchFiles } from "@pierre/diffs";
import { CodeView } from "@pierre/diffs/react";
import { type CSSProperties, type ReactNode, useMemo } from "react";
import { type DiffSettings, LIGHT_THEME, type Theme, useSettings } from "@/lib/settings";

// A line of code is this many times as tall as its text.
const LINE_HEIGHT = 1.65;
// The bar beside a new line is this wide, in px like the diff's own bars.
const NEW_LINE_BAR_PX = 3;

// Lines to mark as new since you last marked the file: added ones by their new-file number, removed ones by their
// old-file number.
export interface NewLines {
  added: number[];
  removed: number[];
}

// Styles for the diff component that put a bar in the selection color beside each new line: on its line number,
// or on the line itself when line numbers are hidden.
function newLinesCss({ added, removed }: NewLines, lineNumbers: boolean) {
  const [column, cell] = lineNumbers ? ["[data-gutter]", "data-column-number"] : ["[data-content]", "data-line"];
  const lines = (type: string, numbers: number[]) =>
    numbers.length
      ? [`${column} > [data-line-type="${type}"]:is(${numbers.map((n) => `[${cell}="${n}"]`).join(",")})`]
      : [];
  const selectors = [...lines("change-addition", added), ...lines("change-deletion", removed)];
  if (!selectors.length) return undefined;
  const look = lineNumbers ? "color: var(--selection); font-weight: 600;" : "";
  return `${selectors.join(",\n")} { box-shadow: inset ${NEW_LINE_BAR_PX}px 0 0 var(--selection); ${look} }`;
}

// A row of the diff in px at a font size; CodeView is told it too, to work out how tall the whole diff is.
const lineHeightAt = (fontSize: number) => Math.round(fontSize * LINE_HEIGHT);

// The diff component's options and font size from the Diff style settings; in Light mode the theme's light twin.
// Colored by the library's own engine, Highlights: it colors 20,000 lines in about 0.2 s on the window itself, where
// the default (Shiki) took 25 s in background workers and froze the window for 45 s without them.
export function diffOptions(diff: DiffSettings, theme: Theme) {
  return {
    options: {
      preferredHighlighter: "highlights" as const,
      theme: { dark: diff.theme, light: LIGHT_THEME[diff.theme] },
      themeType: theme === "light" ? ("light" as const) : ("dark" as const),
      diffStyle: diff.layout,
      overflow: diff.longLines,
      lineDiffType: diff.inline,
      diffIndicators: diff.markers,
      disableBackground: !diff.backgrounds,
      disableLineNumbers: !diff.lineNumbers,
      disableFileHeader: true,
    },
    style: {
      "--diffs-font-size": `${diff.fontSize}px`,
      "--diffs-line-height": `${lineHeightAt(diff.fontSize)}px`,
    } as CSSProperties,
  };
}

// A short hash of a text (FNV-1a), to tell one version of a diff from another.
function hashText(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

// The patch as CodeView's one item, parsed once. Its version is a hash of the text, so new text for the same file
// (Show all, a live edit) is redrawn in place, where you are.
function useDiffItems(id: string, patch: string | null): CodeViewItem<undefined>[] {
  return useMemo(() => {
    if (!patch) return [];
    const fileDiff = parsePatchFiles(patch)[0]?.files[0];
    return fileDiff ? [{ id, type: "diff", fileDiff, version: hashText(patch) }] : [];
  }, [id, patch]);
}

interface Props {
  id: string; // a new id starts the diff from the top; new text for the same id is swapped in where you are
  patch: string | null;
  footer?: ReactNode;
  newLines?: NewLines | null; // lines marked as new since you marked the file
  empty: string; // shown when there is no patch
}

// A diff in a card that scrolls inside itself; `empty` shows instead when there is no patch. Drawn by the library's
// CodeView, which draws only the rows in view (a 20,000-line diff scrolls as smoothly as a short one) and is told the
// row height so it knows the whole diff's height before drawing it. `footer` goes under the last line (a cut diff's
// Show all).
export function DiffView({ id, patch, footer, newLines, empty }: Props) {
  const { settings, theme } = useSettings();
  const items = useDiffItems(id, patch);
  const unsafeCSS = newLines ? newLinesCss(newLines, settings.diff.lineNumbers) : undefined;
  // Kept the same object while nothing in it changes, so CodeView doesn't redraw on every render.
  const { options, style } = useMemo(() => {
    const { options, style } = diffOptions(settings.diff, theme);
    const itemMetrics = { lineHeight: lineHeightAt(settings.diff.fontSize) };
    return { options: { ...options, unsafeCSS, itemMetrics, layout: CARD_LAYOUT }, style };
  }, [settings.diff, theme, unsafeCSS]);
  if (!items.length) {
    return (
      <div className="flex h-24 shrink-0 items-center rounded-xl border bg-card px-6 text-sm text-faint">{empty}</div>
    );
  }
  return (
    // A new id is a new card, starting from the top.
    <CodeView
      key={id}
      items={items}
      options={options}
      style={style}
      className="min-h-0 shrink overflow-auto rounded-xl border bg-card"
      renderCodeViewFooter={footer ? () => footer : undefined}
    />
  );
}

// No padding or gaps around the one diff: the card's border is its edge.
const CARD_LAYOUT = { paddingTop: 0, paddingBottom: 0, gap: 0 };
