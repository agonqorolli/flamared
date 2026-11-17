import { PatchDiff } from "@pierre/diffs/react";
import { diffOptions } from "@/components/DiffView";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { hint } from "@/lib/keys";
import { DIFF_THEMES, type DiffSettings as Diff, type DiffTheme, useSettings } from "@/lib/settings";
import { SectionHead } from "./SectionHead";
import { Choice, ResetButton, SettingRow, SettingsBody } from "./SettingRow";

// A short made-up change, so every option can be seen as it is changed.
const PREVIEW = [
  "diff --git a/src/total.ts b/src/total.ts",
  "--- a/src/total.ts",
  "+++ b/src/total.ts",
  "@@ -1,7 +1,8 @@",
  ' import { round } from "./math";',
  " ",
  "-export function total(items: Item[]) {",
  "-  return items.reduce((sum, item) => sum + item.price, 0);",
  "+export function total(items: Item[], tax = 0) {",
  "+  const net = items.reduce((sum, item) => sum + item.price * item.quantity, 0);",
  "+  return round(net * (1 + tax), 2);",
  " }",
  " ",
  " export const EMPTY_CART: Item[] = [];",
  "",
].join("\n");

const LAYOUTS: { value: Diff["layout"]; label: string }[] = [
  { value: "unified", label: "Unified" },
  { value: "split", label: "Split" },
];
const LONG_LINES: { value: Diff["longLines"]; label: string }[] = [
  { value: "scroll", label: "Scroll" },
  { value: "wrap", label: "Wrap" },
];
const FONT_SIZES: { value: Diff["fontSize"]; label: string }[] = [
  { value: 11, label: "11" },
  { value: 12, label: "12" },
  { value: 13, label: "13" },
  { value: 14, label: "14" },
];
const INLINE_CHANGES: { value: Diff["inline"]; label: string }[] = [
  { value: "word-alt", label: "Words" },
  { value: "word", label: "Words, strict" },
  { value: "char", label: "Characters" },
  { value: "none", label: "Off" },
];
const MARKERS: { value: Diff["markers"]; label: string }[] = [
  { value: "classic", label: "+ / −" },
  { value: "bars", label: "Bars" },
  { value: "none", label: "None" },
];

// Settings → Diff style: how diffs look in Changes and Timeline, with a preview that follows every change.
export function DiffSettings() {
  const { settings, theme, setDiff, resetDiff } = useSettings();
  const diff = settings.diff;
  const { options, style } = diffOptions(diff, theme);
  return (
    <>
      <SectionHead title="Diff style" text="How changes look in Changes and Timeline." />
      {/* The preview stays in view; only the settings below it scroll. */}
      <div className="shrink-0 border-b px-6 py-4">
        <div className="max-h-56 overflow-auto rounded-xl border bg-card" aria-label="Preview">
          <PatchDiff patch={PREVIEW} options={options} style={style} />
        </div>
      </div>
      <SettingsBody>
        <FieldGroup>
          <SettingRow label="Color theme" description="Syntax colors of the code." htmlFor="diff-theme">
            <Select value={diff.theme} onValueChange={(theme) => setDiff({ theme: theme as DiffTheme })}>
              <SelectTrigger id="diff-theme" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {DIFF_THEMES.map(({ id, label }) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingRow>
          <FieldSeparator />
          <SettingRow
            label="Layout"
            description={<>One column, or the old and new code side by side. {hint("splitDiff")} switches it.</>}
          >
            <Choice value={diff.layout} options={LAYOUTS} onChange={(layout) => setDiff({ layout })} />
          </SettingRow>
          <SettingRow label="Long lines" description="Scroll sideways, or wrap onto the next line.">
            <Choice value={diff.longLines} options={LONG_LINES} onChange={(longLines) => setDiff({ longLines })} />
          </SettingRow>
          <SettingRow label="Text size">
            <Choice value={diff.fontSize} options={FONT_SIZES} onChange={(fontSize) => setDiff({ fontSize })} />
          </SettingRow>
          <FieldSeparator />
          <SettingRow label="Changes inside a line" description="How the changed part of a line is highlighted.">
            <Choice value={diff.inline} options={INLINE_CHANGES} onChange={(inline) => setDiff({ inline })} />
          </SettingRow>
          <SettingRow label="Change markers" description="What marks an added or removed line in the margin.">
            <Choice value={diff.markers} options={MARKERS} onChange={(markers) => setDiff({ markers })} />
          </SettingRow>
          <SettingRow
            label="Line backgrounds"
            description="Green and red behind added and removed lines."
            htmlFor="diff-bg"
          >
            <Switch
              id="diff-bg"
              checked={diff.backgrounds}
              onCheckedChange={(backgrounds) => setDiff({ backgrounds })}
            />
          </SettingRow>
          <SettingRow label="Line numbers" htmlFor="diff-numbers">
            <Switch
              id="diff-numbers"
              checked={diff.lineNumbers}
              onCheckedChange={(lineNumbers) => setDiff({ lineNumbers })}
            />
          </SettingRow>
          <FieldSeparator />
          <SettingRow label="Defaults" description="Put every diff setting back the way it started.">
            <ResetButton onClick={resetDiff} />
          </SettingRow>
        </FieldGroup>
      </SettingsBody>
    </>
  );
}
