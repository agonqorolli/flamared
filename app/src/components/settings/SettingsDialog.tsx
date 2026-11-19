import { BotIcon, CodeIcon, FileMinusIcon, InfoIcon, KeyboardIcon, KeyRoundIcon, PaletteIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { LicenseSettings } from "@/components/license/LicenseSettings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AboutSettings } from "./AboutSettings";
import { AgentSettings } from "./AgentSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { DiffSettings } from "./DiffSettings";
import { FilesSettings } from "./FilesSettings";
import { KeyboardSettings } from "./KeyboardSettings";

// Sections of the settings menu.
const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: PaletteIcon, content: AppearanceSettings },
  { id: "diff", label: "Diff style", icon: CodeIcon, content: DiffSettings },
  { id: "agents", label: "Agents", icon: BotIcon, content: AgentSettings },
  { id: "files", label: "Files", icon: FileMinusIcon, content: FilesSettings },
  { id: "keyboard", label: "Keyboard", icon: KeyboardIcon, content: KeyboardSettings },
  { id: "license", label: "License", icon: KeyRoundIcon, content: LicenseSettings },
  { id: "about", label: "About", icon: InfoIcon, content: AboutSettings },
] as const;
export type SettingsSection = (typeof SECTIONS)[number]["id"];

interface Props {
  open: boolean;
  start?: SettingsSection;
  onOpenChange: (open: boolean) => void;
}

// Settings: the menu on the left, the chosen section's settings on the right. `start` picks the section it opens
// on (the trial note in the header opens License, the no-repository screen Agents); otherwise it opens where it was left.
export function SettingsDialog({ open, start, onOpenChange }: Props) {
  const [section, setSection] = useState<SettingsSection>("appearance");
  useEffect(() => {
    if (open && start) setSection(start);
  }, [open, start]);
  const Content = SECTIONS.find(({ id }) => id === section)?.content ?? AppearanceSettings;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(640px,calc(100vh-4rem))] gap-0 overflow-hidden p-0 outline-none sm:max-w-[860px]"
        // Focus the dialog, not its first menu button: opened with ⌘, or ? that button would show a focus ring.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Change how the app looks and works.</DialogDescription>
        <nav aria-label="Settings sections" className="flex w-48 shrink-0 flex-col gap-0.5 border-r bg-sidebar p-2">
          <div className="px-2 pt-2 pb-3 text-sm font-semibold">Settings</div>
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              size="sm"
              aria-current={section === id || undefined}
              onClick={() => setSection(id)}
              className={cn("justify-start", section === id && "bg-accent text-accent-foreground")}
            >
              <Icon data-icon="inline-start" />
              {label}
            </Button>
          ))}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Content />
        </div>
      </DialogContent>
    </Dialog>
  );
}
