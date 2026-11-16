import { useState } from "react";
import { ChevronDownIcon, ClockIcon, FolderGit2Icon, FileDiffIcon, MapIcon, FolderPlusIcon, GitBranchIcon, InfoIcon, RefreshCwIcon, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KeyHint } from "@/components/KeyHint";
import { MiddlePath } from "@/components/MiddlePath";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { canPickFolder, loadBranchFiles, loadRepoStatus, recentRepos } from "@/lib/api";
import { base, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BranchRow, RepoRow, RepoStatus, Snapshot } from "@/lib/types";
import type { Opening } from "@/lib/live";
import type { Waiting } from "@/lib/waiting";
import { shortDate, useLicense } from "@/lib/license";
import { hint } from "@/lib/keys";
import type { Section } from "@/components/settings/SettingsDialog";

export type View = "changes" | "timeline" | "map";

interface Props {
  snap: Snapshot | null;
  view: View;
  loading: boolean;
  opening: Opening | null;
  onView: (v: View) => void;
  onOpenRepo: (path: string) => void;
  onOpenFolder: () => void;
  onViewBranch: (branch: string | null) => void;
  onRefresh: () => void;
  onSettings: (at?: Section) => void;
  live: { on: boolean; updating: boolean; pending: Waiting | null; set: (on: boolean) => void } | null; // null: no watcher (browser preview)
}

export function Header({ snap, view, loading, opening, live, onView, onOpenRepo, onOpenFolder, onViewBranch, onRefresh, onSettings }: Props) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3.5 border-b bg-panel px-3">
      <div className="flex min-w-max flex-1 basis-0 items-center gap-2.5">
        {snap && <RepoPicker snap={snap} onOpenRepo={onOpenRepo} onOpenFolder={onOpenFolder} switching={!!opening} />}
        {snap && <BranchPicker snap={snap} onViewBranch={onViewBranch} disabled={!!opening?.repoChanged} switching={!!opening} />}
      </div>
      {/* Main navigation: plain tabs with an underline (shadcn's line variant), not boxed buttons. The header has
          no vertical padding here so the underline sits on its bottom border. */}
      <Tabs value={view} onValueChange={(v) => onView(v as View)} className="self-stretch">
        <TabsList variant="line" className="gap-3 p-0 group-data-horizontal/tabs:h-full">
          <TabsTrigger value="changes" title={`Changes (${hint("goChanges")})`} className="h-full px-1 group-data-horizontal/tabs:after:-bottom-px">
            <FileDiffIcon data-icon="inline-start" />
            Changes
            <KeyHint id="goChanges" className="-bottom-0.5" />
          </TabsTrigger>
          <TabsTrigger value="timeline" title={`Timeline (${hint("goTimeline")})`} className="h-full px-1 group-data-horizontal/tabs:after:-bottom-px">
            <ClockIcon data-icon="inline-start" />
            Timeline
            <KeyHint id="goTimeline" className="-bottom-0.5" />
          </TabsTrigger>
          <TabsTrigger value="map" title={`Map (${hint("goMap")})`} className="h-full px-1 group-data-horizontal/tabs:after:-bottom-px">
            <MapIcon data-icon="inline-start" />
            Map
            <KeyHint id="goMap" className="-bottom-0.5" />
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-1 basis-0 justify-end gap-1.5">
        {live && snap && <LiveToggle {...live} updating={live.updating} />}
        <Button variant="outline" size="icon-sm" onClick={onRefresh} disabled={loading || !snap} aria-label={loading ? "Loading" : "Reload"} title={loading ? "Loading…" : `Reload now (${hint("reload")})`}>
          {loading ? <Spinner /> : <RefreshCwIcon />}
          <KeyHint id="reload" />
        </Button>
        <TrialNote onOpen={() => onSettings("license")} />
        <Button variant="outline" size="icon-sm" onClick={() => onSettings()} aria-label="Settings" title={`Settings (${hint("settings")})`}>
          <SettingsIcon />
          <KeyHint id="settings" />
        </Button>
      </div>
    </header>
  );
}

// One row of the repo or branch list: the name, its changed files as a badge ("63 files", the count the Changes
// screen shows above its list; none when there are none), and an optional faint line under it. The one on screen
// (`on`) is highlighted like the selected row in the Changes and Timeline lists (blue, with a bar on the left).
function PickerItem({ value, on, title, files, sub, onSelect }: {
  value: string;
  on: boolean;
  title: string;
  files?: { n: number; title: string };
  sub?: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      aria-current={on || undefined}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-md px-3 py-1.5",
        on && "bg-selection-bg text-accent-foreground shadow-[inset_2px_0_0_var(--selection)] data-selected:bg-selection-bg data-selected:text-accent-foreground",
      )}
    >
      <span className="truncate font-medium">{title}</span>
      <span className="col-start-2">
        {!!files?.n && (
          <span title={files.title} className="rounded-full bg-foreground/10 px-1.5 text-micro text-muted-foreground">
            {plural(files.n, "file")}
          </span>
        )}
      </span>
      {sub && <span className="col-span-2 min-w-0 truncate text-mini text-faint">{sub}</span>}
    </CommandItem>
  );
}

// The repo and branch lists: a little space between rows, and the heading lined up with the rows' text.
const pickerGroup = "**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-items]]:flex **:[[cmdk-group-items]]:flex-col **:[[cmdk-group-items]]:gap-1";

// A repo row's value for the list's search and keyboard position: its name and folder.
const rowValue = (r?: RepoRow) => r && `${r.name} ${r.path}`;

// Repos agents have worked in on this machine. Picking one loads it. When the list opens, each repo's checked-out
// branch and uncommitted files are read (one quick git status each), for "on <branch>" and "N to check".
function RepoPicker({ snap, onOpenRepo, onOpenFolder, switching }: { snap: Snapshot; onOpenRepo: (path: string) => void; onOpenFolder: () => void; switching: boolean }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Record<string, RepoStatus>>({});
  // Repos agents worked in, plus ones you opened yourself (Open folder…) that no agent session points to.
  const rows: RepoRow[] = [
    ...snap.repos,
    ...recentRepos()
      .filter((r) => !snap.repos.some((x) => x.full === r.path))
      .map((r) => ({ name: base(r.path), path: r.path, full: r.path, sessions: 0, last: r.at, current: r.path === snap.path })),
  ];
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) loadRepoStatus(rows.map((r) => r.full)).then((xs) => setStatus(Object.fromEntries(xs.map((x) => [x.full, x]))), () => {});
  };
  // The open repo on its checked-out branch is counted exactly (marks checked against each file's change).
  // The open repo on its checked-out branch: the files the Changes screen lists.
  const openCount = snap.viewing.checked_out ? snap.stats.files : null;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-56 font-medium" title={`Repository: ${snap.path}`}>
          <FolderGit2Icon data-icon="inline-start" />
          <span className="truncate">{snap.repo}</span>
          <ChevronDownIcon data-icon="inline-end" />
          {canPickFolder && <KeyHint id="openFolder" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[380px] p-0">
        <Command defaultValue={rowValue(rows.find((r) => r.current))}>
          {rows.length > 6 && <CommandInput placeholder="Find a repository" />}
          <CommandList className="max-h-[max(18rem,50vh)]">
            <CommandEmpty>No repository matches</CommandEmpty>
            <CommandGroup heading="Repositories" className={pickerGroup}>
              {rows.map((r) => {
                const st = status[r.full];
                const count = r.current && openCount != null ? openCount : (st?.changed.length ?? 0);
                return (
                  <PickerItem
                    key={r.full}
                    value={rowValue(r)!}
                    on={r.current}
                    title={r.name}
                    files={{ n: count, title: "Uncommitted changed files, as the Changes screen lists them" }}
                    sub={<MiddlePath path={r.path} />}
                    onSelect={() => {
                      setOpen(false);
                      if (!r.current || switching) onOpenRepo(r.full);
                    }}
                  />
                );
              })}
            </CommandGroup>
          </CommandList>
          <CommandGroup forceMount className="border-t">
            <CommandItem
              forceMount
              disabled={!canPickFolder}
              title={canPickFolder ? "Open any git repository" : "Only in the app"}
              onSelect={() => {
                setOpen(false);
                onOpenFolder();
              }}
            >
              <FolderPlusIcon />
              Open folder…
              {canPickFolder && <CommandShortcut>{hint("openFolder")}</CommandShortcut>}
            </CommandItem>
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Branches of this repo. Viewing is read-only. When the list opens, each other branch's changed files are counted
// (as viewing it would show them), and the checked-out branch's files to check.
function BranchPicker({ snap, onViewBranch, disabled, switching }: { snap: Snapshot; onViewBranch: (branch: string | null) => void; disabled: boolean; switching: boolean }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<Record<string, number>>({});
  const [own, setOwn] = useState<RepoStatus | null>(null); // the checked-out branch, while another is viewed
  const local = snap.branches.filter((b) => !b.remote);
  const remote = snap.branches.filter((b) => b.remote);
  const viewing = snap.viewing.branch;
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) return;
    loadBranchFiles(snap.path).then(setFiles, () => {});
    if (!snap.viewing.checked_out) loadRepoStatus([snap.path]).then((xs) => setOwn(xs[0] ?? null), () => {});
  };
  const ownCount = snap.viewing.checked_out ? snap.stats.files : (own?.changed.length ?? 0);
  return (
    <Popover open={open && !disabled} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="max-w-56 font-medium" title={snap.viewing.checked_out ? `Working folder: ${viewing}` : `Previewing ${viewing}`}>
          <GitBranchIcon data-icon="inline-start" />
          <span className="truncate">{viewing}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[380px] p-0">
        <Command defaultValue={viewing}>
          {snap.branches.length > 6 && <CommandInput placeholder="Find a branch" />}
          <CommandList className="max-h-[max(18rem,50vh)]">
            <CommandEmpty>No branch matches</CommandEmpty>
            {[["Local", local] as const, ["Remote", remote] as const]
              .filter(([, xs]) => xs.length)
              .map(([label, xs], i) => (
                <CommandGroup
                  key={label}
                  heading={
                    <span className="flex items-center gap-1.5">
                      {remote.length ? label : "Branches"}
                      {i === 0 && <ReadOnlyTip />}
                    </span>
                  }
                  className={pickerGroup}
                >
                  {xs.map((b) => {
                    const n = files[b.name] ?? 0;
                    return (
                      <PickerItem
                        key={b.name}
                        value={b.name}
                        on={b.name === viewing}
                        title={b.name}
                        files={
                          b.current
                            ? { n: ownCount, title: "Uncommitted changed files, as the Changes screen lists them" }
                            : { n, title: `Files changed ${b.worktree ? "in its working folder" : "since it split off"}, as the preview shows them` }
                        }
                        sub={<LastCommit branch={b} />}
                        onSelect={() => {
                          setOpen(false);
                          if (b.name !== viewing || switching) onViewBranch(b.current ? null : b.name);
                        }}
                      />
                    );
                  })}
                </CommandGroup>
              ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// After the first heading: viewing a branch is read-only. Not tabbable, so the popover's auto-focus doesn't land on it
// and open the tooltip; it opens on hover only.
function ReadOnlyTip() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button tabIndex={-1} className="inline-flex size-4 items-center justify-center rounded-full text-faint hover:text-foreground" aria-label="About previewing a branch">
          <InfoIcon className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-64">
        Previewing a branch doesn't change your working folder. A branch with its own working folder also shows its uncommitted changes.
      </TooltipContent>
    </Tooltip>
  );
}

// Under a branch name: its last commit's subject, on one truncated line.
function LastCommit({ branch: b }: { branch: BranchRow }) {
  return b.subject ? <span className="block truncate">{b.subject}</span> : null;
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
          <KeyHint id="live" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64 flex-col items-start gap-1">
        {on ? (
          `Updates by itself when files change or an agent works in this repo. Click or press ${hint("live")} to pause. ${hint("reload")} reloads now.`
        ) : pending ? (
          <>
            <span>Waiting while paused:</span>
            {pending.details.map((d) => (
              <span key={d}>· {d}</span>
            ))}
            <span className="text-muted-foreground">Click or press {hint("live")} to go live and load them, or reload once ({hint("reload")}).</span>
          </>
        ) : (
          `Not updating by itself. Click or press ${hint("live")} to go live, or reload once (${hint("reload")}).`
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
