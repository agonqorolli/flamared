import { useEffect, useState } from "react";
import { PatchDiff } from "@pierre/diffs/react";
import { CodeIcon, KeyboardIcon, KeyRoundIcon, PaletteIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { diffOptions } from "@/components/DiffView";
import { DIFF_THEMES, useSettings, type AppearanceSettings, type DiffSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { LicenseSettings } from "@/components/license/LicenseSettings";
import { SectionHead } from "./SectionHead";
import { KeyboardSettings } from "./KeyboardSettings";
import { hint } from "@/lib/keys";

// Sections of the settings menu. More come later (files to leave out...).
const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: PaletteIcon },
  { id: "diff", label: "Diff style", icon: CodeIcon },
  { id: "keyboard", label: "Keyboard", icon: KeyboardIcon },
  { id: "license", label: "License", icon: KeyRoundIcon },
] as const;
export type Section = (typeof SECTIONS)[number]["id"];

// Settings: the menu on the left, the chosen section's settings on the right. `start` picks the section it opens
// on (the trial note in the header opens License); otherwise it opens where it was left.
export function SettingsDialog({ open, start, onOpenChange }: { open: boolean; start?: Section; onOpenChange: (open: boolean) => void }) {
  const [section, setSection] = useState<Section>("appearance");
  useEffect(() => {
    if (open && start) setSection(start);
  }, [open, start]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(640px,calc(100vh-4rem))] gap-0 overflow-hidden p-0 outline-none sm:max-w-[860px]"
        // Focus the dialog, not its first menu button: opened with ⌘, or ? that button would show a focus ring.
        onOpenAutoFocus={(e) => (e.preventDefault(), (e.currentTarget as HTMLElement).focus())}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Change how the app looks and works.</DialogDescription>
        <nav aria-label="Settings sections" className="flex w-48 shrink-0 flex-col gap-0.5 border-r bg-sidebar p-2">
          <div className="px-2 pt-2 pb-3 text-sm font-semibold">Settings</div>
          {SECTIONS.map((s) => (
            <Button
              key={s.id}
              variant="ghost"
              size="sm"
              aria-current={section === s.id || undefined}
              onClick={() => setSection(s.id)}
              className={cn("justify-start", section === s.id && "bg-accent text-accent-foreground")}
            >
              <s.icon data-icon="inline-start" />
              {s.label}
            </Button>
          ))}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {section === "appearance" && <Appearance />}
          {section === "diff" && <DiffStyle />}
          {section === "keyboard" && <KeyboardSettings />}
          {section === "license" && <LicenseSettings />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Each theme's look in two swatches: the window and a card on it (theme colors shown as data).
const THEMES: [AppearanceSettings["theme"], string, string, string][] = [
  ["dark", "Dark", "#0D0E11", "#1A1D23"],
  ["gray", "Gray", "#1E2024", "#2E3137"],
  ["light", "Light", "#FFFFFF", "#E6E9ED"],
];

function Appearance() {
  const { settings, setAppearance, resetAppearance } = useSettings();
  const a = settings.appearance;
  return (
    <>
      <SectionHead title="Appearance" text="How the app looks. Changes show right away." />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Theme</FieldLabel>
              <FieldDescription>Gray is the dark theme with softer contrast. Diffs switch to a light code theme in Light.</FieldDescription>
            </FieldContent>
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={a.theme} onValueChange={(v) => v && setAppearance({ theme: v as AppearanceSettings["theme"] })}>
              {THEMES.map(([id, label, back, card]) => (
                <ToggleGroupItem key={id} value={id}>
                  <span className="relative size-3.5 shrink-0 overflow-hidden rounded-[4px] border border-foreground/20" style={{ background: back }} aria-hidden>
                    <span className="absolute right-0 bottom-0 size-2 rounded-tl-[3px]" style={{ background: card }} />
                  </span>
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Density</FieldLabel>
              <FieldDescription>Space between rows and around panels. Text stays the same size.</FieldDescription>
            </FieldContent>
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={a.density} onValueChange={(v) => v && setAppearance({ density: v as AppearanceSettings["density"] })}>
              <ToggleGroupItem value="compact">Compact</ToggleGroupItem>
              <ToggleGroupItem value="normal">Normal</ToggleGroupItem>
              <ToggleGroupItem value="spacious">Spacious</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <FieldSeparator />
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Defaults</FieldLabel>
              <FieldDescription>Gray theme, normal density.</FieldDescription>
            </FieldContent>
            <Button variant="outline" size="sm" onClick={resetAppearance}>
              <RotateCcwIcon data-icon="inline-start" />
              Reset to defaults
            </Button>
          </Field>
        </FieldGroup>
      </div>
    </>
  );
}

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

function DiffStyle() {
  const { settings, setDiff, resetDiff } = useSettings();
  const d = settings.diff;
  const { options, style } = diffOptions(d, settings.appearance);
  const choice = <K extends keyof DiffSettings>(key: K, items: [DiffSettings[K], string][]) => (
    <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={String(d[key])} onValueChange={(v) => v && setDiff({ [key]: items.find(([x]) => String(x) === v)![0] } as Partial<DiffSettings>)}>
      {items.map(([v, label]) => (
        <ToggleGroupItem key={String(v)} value={String(v)}>
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
  return (
    <>
      <SectionHead title="Diff style" text="How changes look in Changes and Timeline." />
      {/* The preview stays in view; only the settings below it scroll. */}
      <div className="shrink-0 border-b px-6 py-4">
        <div className="max-h-56 overflow-auto rounded-xl border bg-card" aria-label="Preview">
          <PatchDiff patch={PREVIEW} options={options} style={style} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="diff-theme">Color theme</FieldLabel>
              <FieldDescription>Syntax colors of the code.</FieldDescription>
            </FieldContent>
            <Select value={d.theme} onValueChange={(v) => setDiff({ theme: v as DiffSettings["theme"] })}>
              <SelectTrigger id="diff-theme" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {DIFF_THEMES.map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <FieldSeparator />
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Layout</FieldLabel>
              <FieldDescription>One column, or the old and new code side by side. {hint("splitDiff")} switches it.</FieldDescription>
            </FieldContent>
            {choice("layout", [["unified", "Unified"], ["split", "Split"]])}
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Long lines</FieldLabel>
              <FieldDescription>Scroll sideways, or wrap onto the next line.</FieldDescription>
            </FieldContent>
            {choice("longLines", [["scroll", "Scroll"], ["wrap", "Wrap"]])}
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Text size</FieldLabel>
            </FieldContent>
            {choice("fontSize", [[11, "11"], [12, "12"], [13, "13"], [14, "14"]])}
          </Field>
          <FieldSeparator />
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Changes inside a line</FieldLabel>
              <FieldDescription>How the changed part of a line is highlighted.</FieldDescription>
            </FieldContent>
            {choice("inline", [["word-alt", "Words"], ["word", "Words, strict"], ["char", "Characters"], ["none", "Off"]])}
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Change markers</FieldLabel>
              <FieldDescription>What marks an added or removed line in the margin.</FieldDescription>
            </FieldContent>
            {choice("markers", [["classic", "+ / −"], ["bars", "Bars"], ["none", "None"]])}
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="diff-bg">Line backgrounds</FieldLabel>
              <FieldDescription>Green and red behind added and removed lines.</FieldDescription>
            </FieldContent>
            <Switch id="diff-bg" checked={d.backgrounds} onCheckedChange={(v) => setDiff({ backgrounds: v })} />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="diff-numbers">Line numbers</FieldLabel>
            </FieldContent>
            <Switch id="diff-numbers" checked={d.lineNumbers} onCheckedChange={(v) => setDiff({ lineNumbers: v })} />
          </Field>
          <FieldSeparator />
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Defaults</FieldLabel>
              <FieldDescription>Put every diff setting back the way it started.</FieldDescription>
            </FieldContent>
            <Button variant="outline" size="sm" onClick={resetDiff}>
              <RotateCcwIcon data-icon="inline-start" />
              Reset to defaults
            </Button>
          </Field>
        </FieldGroup>
      </div>
    </>
  );
}
