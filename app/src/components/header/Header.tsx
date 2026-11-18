import { RefreshCwIcon, SettingsIcon } from "lucide-react";
import { KeyHint } from "@/components/KeyHint";
import type { SettingsSection } from "@/components/settings/SettingsDialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inTauri } from "@/lib/api";
import { hint } from "@/lib/keys";
import type { Opening } from "@/lib/live";
import type { Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { type View, VIEWS } from "@/lib/views";
import { BranchPicker } from "./BranchPicker";
import { type Live, LiveToggle } from "./LiveToggle";
import { RepoPicker } from "./RepoPicker";
import { TrialNote } from "./TrialNote";
import { UpdateNote } from "./UpdateNote";

interface Props {
  snap: Snapshot | null;
  view: View;
  loading: boolean;
  opening: Opening | null;
  live: Live | null; // null: no watcher (browser preview)
  onView: (view: View) => void;
  onOpenRepo: (path: string) => void;
  onOpenFolder: () => void;
  onViewBranch: (branch: string | null) => void;
  onRefresh: () => void;
  onSettings: (at?: SettingsSection) => void;
}

// In the Mac app the native title bar is hidden and the header takes its place (tauri.conf.json): dragging its empty
// space moves the window, and its left end leaves room for the window buttons (14px from the edge, set in
// tauri.conf.json) with the same 14px after them. In px, not spacing units: density mustn't move it.
const isTitleBar = inTauri && navigator.userAgent.includes("Mac");

// The bar across the top: the repo and branch pickers, the three screens' tabs, and Live, reload and settings.
export function Header({
  snap,
  view,
  loading,
  opening,
  live,
  onView,
  onOpenRepo,
  onOpenFolder,
  onViewBranch,
  onRefresh,
  onSettings,
}: Props) {
  return (
    <header
      data-tauri-drag-region="deep"
      className={cn("flex h-11 shrink-0 items-center gap-3.5 border-b bg-panel px-3", isTitleBar && "pl-[88px]")}
    >
      <div className="flex min-w-max flex-1 basis-0 items-center gap-2.5">
        {snap && <RepoPicker snap={snap} onOpenRepo={onOpenRepo} onOpenFolder={onOpenFolder} switching={!!opening} />}
        {snap && (
          <BranchPicker
            snap={snap}
            onViewBranch={onViewBranch}
            disabled={!!opening?.repoChanged}
            switching={!!opening}
          />
        )}
      </div>
      {/* Main navigation: plain tabs with an underline (shadcn's line variant), not boxed buttons. The header has
          no vertical padding here so the underline sits on its bottom border. No focus ring: Radix focuses a tab
          when it is clicked, and WebKit then shows the keyboard ring on every click; the underline marks the screen
          and each one has its own key. */}
      <Tabs value={view} onValueChange={(value) => onView(value as View)} className="self-stretch">
        <TabsList variant="line" className="gap-3 p-0 group-data-horizontal/tabs:h-full">
          {VIEWS.map(({ id, name, icon: Icon, goKey }) => (
            <TabsTrigger
              key={id}
              value={id}
              title={`${name} (${hint(goKey)})`}
              className="h-full px-1 group-data-horizontal/tabs:after:-bottom-px focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-none"
            >
              <Icon data-icon="inline-start" />
              {name}
              <KeyHint id={goKey} className="-bottom-0.5" />
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex flex-1 basis-0 justify-end gap-1.5">
        <UpdateNote />
        <TrialNote onOpen={() => onSettings("license")} />
        {live && snap && <LiveToggle {...live} />}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onRefresh}
          disabled={loading || !snap}
          aria-label={loading ? "Loading" : "Reload"}
          title={loading ? "Loading…" : `Reload now (${hint("reload")})`}
        >
          {loading ? <Spinner /> : <RefreshCwIcon />}
          <KeyHint id="reload" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onSettings()}
          aria-label="Settings"
          title={`Settings (${hint("settings")})`}
        >
          <SettingsIcon />
          <KeyHint id="settings" />
        </Button>
      </div>
    </header>
  );
}
