import { PatchDiff } from "@pierre/diffs/react";
import type { CSSProperties } from "react";
import { type DiffSettings, LIGHT_THEME, type Theme, useSettings } from "@/lib/settings";

// A line of code is this many times as tall as its text.
const LINE_HEIGHT = 1.65;

// The diff component's options and font size from the Diff style settings; in Light mode the theme's light twin.
export function diffOptions(diff: DiffSettings, theme: Theme) {
  return {
    options: {
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
      "--diffs-line-height": `${Math.round(diff.fontSize * LINE_HEIGHT)}px`,
    } as CSSProperties,
  };
}

interface Props {
  id: string; // a new id starts the diff from the top
  patch: string | null;
  more?: string | null; // "… 120 more lines", when the diff was cut
  empty: string; // shown when there is no patch
}

// A diff in a card that scrolls inside itself; `empty` shows instead when there is no patch.
export function DiffView({ id, patch, more, empty }: Props) {
  const { settings, theme } = useSettings();
  if (!patch) {
    return (
      <div className="flex h-24 shrink-0 items-center rounded-xl border bg-card px-6 text-sm text-faint">{empty}</div>
    );
  }
  const { options, style } = diffOptions(settings.diff, theme);
  return (
    <div className="min-h-0 shrink overflow-auto rounded-xl border bg-card">
      <PatchDiff key={id} patch={patch} options={options} style={style} />
      {more && <div className="border-t px-4 py-2 text-xs text-faint">{more}</div>}
    </div>
  );
}
