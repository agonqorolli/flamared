import { useState } from "react";
import { CheckIcon, ChevronDownIcon, ClockIcon, FolderGit2Icon, FileDiffIcon, MapIcon, FolderPlusIcon, GitBranchIcon, RefreshCwIcon, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { canPickFolder, recentRepos } from "@/lib/api";
import { ago, base, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RepoRow, Snapshot } from "@/lib/types";
import type { Waiting } from "@/lib/waiting";
import { shortDate, useLicense } from "@/lib/license";
import type { Section } from "@/components/settings/SettingsDialog";

export type View = "changes" | "timeline" | "map";

interface Props {
  snap: Snapshot | null;
  view: View;
  loading: boolean;
  onView: (v: View) => void;
  onOpenRepo: (path: string) => void;
  onOpenFolder: () => void;
  onViewBranch: (branch: string | null) => void;
  onRefresh: () => void;
  onSettings: (at?: Section) => void;
  live: { on: boolean; updating: boolean; pending: Waiting | null; set: (on: boolean) => void } | null; // null: no watcher (browser preview)
}

export function Header({ snap, view, loading, live, onView, onOpenRepo, onOpenFolder, onViewBranch, onRefresh, onSettings }: Props) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3.5 border-b bg-panel px-3">
      <div className="flex min-w-max flex-1 basis-0 items-center gap-2.5">
        {snap && <RepoPicker snap={snap} onOpenRepo={onOpenRepo} onOpenFolder={onOpenFolder} />}
        {snap && <BranchPicker snap={snap} onViewBranch={onViewBranch} />}
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
        <TrialNote onOpen={() => onSettings("license")} />
        <Button variant="outline" size="icon-sm" onClick={() => onSettings()} aria-label="Settings" title="Settings (⌘,)">
          <SettingsIcon />
        </Button>
      </div>
    </header>
  );
}

// Repos agents have worked in on this machine. Picking one loads it.
function RepoPicker({ snap, onOpenRepo, onOpenFolder }: { snap: Snapshot; onOpenRepo: (path: string) => void; onOpenFolder: () => void }) {
  const [open, setOpen] = useState(false);
  // Repos agents worked in, plus ones you opened yourself (Open folder…) that no agent session points to.
  const rows: RepoRow[] = [
    ...snap.repos,
    ...recentRepos()
      .filter((r) => !snap.repos.some((x) => x.full === r.path))
      .map((r) => ({ name: base(r.path), path: r.path, full: r.path, sessions: 0, last: r.at, current: r.path === snap.path })),
  ];
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
          {rows.length > 6 && <CommandInput placeholder="Find a repository" />}
          <CommandList>
            <CommandEmpty>No repository matches</CommandEmpty>
            <CommandGroup heading="Repositories">
              {rows.map((r) => (
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
                    {r.sessions ? plural(r.sessions, "session") : "no agent sessions"} · {r.path}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                disabled={!canPickFolder}
                title={canPickFolder ? "Open any git repository" : "Only in the app"}
                onSelect={() => {
                  setOpen(false);
                  onOpenFolder();
                }}
              >
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
function BranchPicker({ snap, onViewBranch }: { snap: Snapshot; onViewBranch: (branch: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const local = snap.branches.filter((b) => !b.remote);
  const remote = snap.branches.filter((b) => b.remote);
  const viewing = snap.viewing.branch;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-56 font-medium" title={`Branch: ${viewing}${snap.viewing.checked_out ? "" : " (viewing, read-only)"}`}>
          <GitBranchIcon data-icon="inline-start" />
          <span className="truncate">{viewing}</span>
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
                    <CommandItem
                      key={b.name}
                      value={b.name}
                      onSelect={() => {
                        setOpen(false);
                        if (b.name !== viewing) onViewBranch(b.current ? null : b.name);
                      }}
                      className="flex-col items-stretch gap-0.5"
                    >
                      <span className="flex items-center gap-2">
                        <CheckIcon className={b.name === viewing ? "text-selection" : "invisible"} />
                        <span className="flex-1 truncate font-medium">{b.name}</span>
                        {b.current && <span className="rounded-full bg-selection-bg px-1.5 text-[10px] text-selection">checked out</span>}
                      </span>
                      <span className="truncate pl-6 text-xs text-faint">
                        {[`last commit ${ago(b.at)}`, b.sessions ? plural(b.sessions, "session") : "", b.current ? "with uncommitted changes" : b.worktree ? "in a worktree, with its uncommitted changes" : "commits since it split off"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
          </CommandList>
          <p className="border-t px-3 py-2 text-xs leading-relaxed text-faint">
            Read-only: viewing a branch never switches your checkout. A branch checked out in a worktree shows that folder, uncommitted changes included.
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

// "9 days left in trial" during the trial, opening Settings → License; nothing once licensed.
function TrialNote({ onOpen }: { onOpen: () => void }) {
  const { status } = useLicense();
  if (status.state !== "trial") return null;
  return (
    <Button variant="ghost" size="sm" onClick={onOpen} className="text-faint" title={`The trial ends ${shortDate(status.ends)}. Enter a license key`}>
      {plural(status.days_left, "day")} left in trial
    </Button>
  );
}
