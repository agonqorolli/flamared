import { useState } from "react";
import { PatchDiff } from "@pierre/diffs/react";
import { CodeIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { diffOptions } from "@/components/DiffView";
import { DIFF_THEMES, useSettings, type DiffSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

// Sections of the settings menu. More come later (files to leave out, license...).
const SECTIONS = [{ id: "diff", label: "Diff style", icon: CodeIcon }] as const;
type Section = (typeof SECTIONS)[number]["id"];

// Settings: the menu on the left, the chosen section's settings on the right.
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [section, setSection] = useState<Section>("diff");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(640px,calc(100vh-4rem))] gap-0 overflow-hidden p-0 sm:max-w-[860px]">
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
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{section === "diff" && <DiffStyle />}</div>
      </DialogContent>
    </Dialog>
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
  const { options, style } = diffOptions(d);
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
      <DialogHeader className="sticky top-0 z-10 flex-row items-center justify-between gap-3 border-b bg-popover px-6 py-4 pr-14">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold">Diff style</h2>
          <p className="text-xs text-muted-foreground">How changes look in Changes and Timeline.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={resetDiff}>
          <RotateCcwIcon data-icon="inline-start" />
          Reset
        </Button>
      </DialogHeader>
      <div className="flex flex-col gap-6 px-6 py-5">
        <div className="overflow-hidden rounded-xl border bg-card" aria-label="Preview">
          <PatchDiff patch={PREVIEW} options={options} style={style} />
        </div>
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
              <FieldDescription>One column, or the old and new code side by side.</FieldDescription>
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
        </FieldGroup>
      </div>
    </>
  );
}
