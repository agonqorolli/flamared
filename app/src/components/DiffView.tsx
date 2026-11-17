import { PatchDiff } from "@pierre/diffs/react";
import { LIGHT_THEME, useSettings, type DiffSettings, type Theme } from "@/lib/settings";

// The diff component's options and font size from the Diff style settings; in Light mode the theme's light twin.
export function diffOptions(d: DiffSettings, theme: Theme) {
  return {
    options: {
      theme: { dark: d.theme, light: LIGHT_THEME[d.theme] },
      themeType: theme === "light" ? ("light" as const) : ("dark" as const),
      diffStyle: d.layout,
      overflow: d.longLines,
      lineDiffType: d.inline,
      diffIndicators: d.markers,
      disableBackground: !d.backgrounds,
      disableLineNumbers: !d.lineNumbers,
      disableFileHeader: true,
    },
    style: { "--diffs-font-size": `${d.fontSize}px`, "--diffs-line-height": `${Math.round(d.fontSize * 1.65)}px` } as React.CSSProperties,
  };
}

// A diff in a card that scrolls inside itself; `empty` shows instead when there is no patch.
export function DiffView({ id, patch, more, empty }: { id: string; patch: string | null; more?: string | null; empty: string }) {
  const { settings, theme } = useSettings();
  if (!patch) {
    return <div className="flex h-24 shrink-0 items-center rounded-xl border bg-card px-6 text-sm text-faint">{empty}</div>;
  }
  const { options, style } = diffOptions(settings.diff, theme);
  return (
    <div className="min-h-0 shrink overflow-auto rounded-xl border bg-card">
      <PatchDiff key={id} patch={patch} options={options} style={style} />
      {more && <div className="border-t px-4 py-2 text-xs text-faint">{more}</div>}
    </div>
  );
}
