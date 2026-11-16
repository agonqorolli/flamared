import { useState } from "react";
import { CheckIcon, ChevronDownIcon, ClockIcon, FolderGit2Icon, FileDiffIcon, MapIcon, FolderPlusIcon, GitBranchIcon, RefreshCwIcon, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { ago, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Snapshot } from "@/lib/types";
import type { Waiting } from "@/lib/waiting";

export type View = "changes" | "timeline" | "map";

interface Props {
  snap: Snapshot | null;
  view: View;
  loading: boolean;
  onView: (v: View) => void;
  onOpenRepo: (path: string) => void;
  onRefresh: () => void;
  onSettings: () => void;
  live: { on: boolean; updating: boolean; pending: Waiting | null; set: (on: boolean) => void } | null; // null: no watcher (browser preview)
}

export function Header({ snap, view, loading, live, onView, onOpenRepo, onRefresh, onSettings }: Props) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3.5 border-b bg-panel px-4">
      <div className="flex min-w-max flex-1 basis-0 items-center gap-2.5">
        {snap && <RepoPicker snap={snap} onOpenRepo={onOpenRepo} />}
        {snap && <BranchPicker snap={snap} />}
      </div>
      {/* Main navigation: plain tabs with an underline (shadcn's line variant), not boxed buttons. The header has
          no vertical padding here so the underline sits on its bottom border. */}
      <Tabs value={view} onValueChange={(v) => onView(v as View)} className="self-stretch">
        <TabsList variant="line" className="gap-3 p-0 group-data-horizontal/tabs:h-full">
          <TabsTrigger value="changes" className="h-full px-1 group-data-horizontal/tabs:after:-bottom-px">
            <FileDiffIcon data-icon="inline-start" />
            Changes
          </TabsTrigger>
          <TabsTrigger value="timeline" className="h-full px-1 group-data-horizontal/tabs:after:-bottom-px">
            <ClockIcon data-icon="inline-start" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="map" className="h-full px-1 group-data-horizontal/tabs:after:-bottom-px">
            <MapIcon data-icon="inline-start" />
            Map
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-1 basis-0 justify-end gap-1.5">
        {live && snap && <LiveToggle {...live} updating={live.updating || loading} />}
        {/* Live reloads by itself; the button is there while paused, or when there is no watcher. ⌘R always works. */}
        {(!live || !live.on) && (
          <Button variant="outline" size="icon-sm" onClick={onRefresh} disabled={loading} aria-label="Refresh" title="Reload now (⌘R)">
            {loading ? <Spinner /> : <RefreshCwIcon />}
          </Button>
        )}
        <Button variant="outline" size="icon-sm" onClick={onSettings} aria-label="Settings" title="Settings (⌘,)">
          <SettingsIcon />
        </Button>
      </div>
    </header>
  );
}

// Repos agents have worked in on this machine. Picking one loads it.
function RepoPicker({ snap, onOpenRepo }: { snap: Snapshot; onOpenRepo: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-56 font-medium" title={`Repository: ${snap.path}`}>
          <FolderGit2Icon data-icon="inline-start" />
          <span className="truncate">{snap.repo}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        <Command>
          {snap.repos.length > 6 && <CommandInput placeholder="Find a repository" />}
          <CommandList>
            <CommandEmpty>No repository matches</CommandEmpty>
            <CommandGroup heading="Repositories with agent sessions">
              {snap.repos.map((r) => (
                <CommandItem
                  key={r.full}
                  value={`${r.name} ${r.path}`}
                  onSelect={() => {
                    setOpen(false);
                    if (!r.current) onOpenRepo(r.full);
                  }}
                  className="flex-col items-stretch gap-0.5"
                >
                  <span className="flex items-center gap-2">
                    <CheckIcon className={r.current ? "text-selection" : "invisible"} />
                    <span className="flex-1 truncate font-medium">{r.name}</span>
                    <span className="text-xs text-faint">{ago(r.last)}</span>
                  </span>
                  <span className="truncate pl-6 text-xs text-faint">
                    {plural(r.sessions, "session")} · {r.path}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem disabled title="Coming with the folder picker">
                <FolderPlusIcon />
                Open folder…
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Branches of this repo. Viewing is read-only; for now only the checked-out branch can be shown.
function BranchPicker({ snap }: { snap: Snapshot }) {
  const local = snap.branches.filter((b) => !b.remote);
  const remote = snap.branches.filter((b) => b.remote);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-56 font-medium" title={`Branch: ${snap.branch}`}>
          <GitBranchIcon data-icon="inline-start" />
          <span className="truncate">{snap.branch}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        <Command>
          {snap.branches.length > 6 && <CommandInput placeholder="Find a branch" />}
          <CommandList>
            <CommandEmpty>No branch matches</CommandEmpty>
            {[["Local", local] as const, ["Remote", remote] as const]
              .filter(([, xs]) => xs.length)
              .map(([label, xs]) => (
                <CommandGroup key={label} heading={remote.length ? label : undefined}>
                  {xs.map((b) => (
                    <CommandItem key={b.name} value={b.name} disabled={!b.current} className="flex-col items-stretch gap-0.5">
                      <span className="flex items-center gap-2">
                        <CheckIcon className={b.current ? "text-selection" : "invisible"} />
                        <span className="flex-1 truncate font-medium">{b.name}</span>
                        {b.current && <span className="rounded-full bg-selection-bg px-1.5 text-[10px] text-selection">checked out</span>}
                      </span>
                      <span className="truncate pl-6 text-xs text-faint">
                        {[`last commit ${ago(b.at)}`, b.sessions ? plural(b.sessions, "session") : "", b.current ? "" : "viewing other branches comes next"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
          </CommandList>
          <p className="border-t px-3 py-2 text-xs leading-relaxed text-faint">
            Read-only: viewing a branch never switches your checkout. Other branches will show their commits since they split off.
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Live: the screens update by themselves when files or agent sessions change. Paused holds them still and says
// when changes are waiting.
function LiveToggle({ on, updating, pending, set }: { on: boolean; updating: boolean; pending: Waiting | null; set: (on: boolean) => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" aria-pressed={on} onClick={() => set(!on)} className="text-xs text-muted-foreground">
          <span className="relative flex size-2">
            {on && updating && <span className="absolute inline-flex size-full animate-ping rounded-full bg-add opacity-75" />}
            <span className={cn("relative inline-flex size-2 rounded-full", on ? "bg-add" : pending ? "bg-warn" : "bg-faint")} />
          </span>
          {on ? "Live" : pending ? `Paused · ${pending.label}` : "Paused"}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64 flex-col items-start gap-1">
        {on ? (
          "Updates by itself when files change or an agent works in this repo. Click to pause. ⌘R reloads now."
        ) : pending ? (
          <>
            <span>Waiting while paused:</span>
            {pending.details.map((d) => (
              <span key={d}>· {d}</span>
            ))}
            <span className="text-muted-foreground">Click to go live and load them, or reload once with the button next to this (⌘R).</span>
          </>
        ) : (
          "Not updating by itself. Click to go live, or reload once with the button next to this (⌘R)."
        )}
      </TooltipContent>
    </Tooltip>
  );
}
