import { ChevronDownIcon, FolderGit2Icon, FolderPlusIcon } from "lucide-react";
import { useState } from "react";
import { KeyHint } from "@/components/KeyHint";
import { MiddlePath } from "@/components/MiddlePath";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { canPickFolder, loadRepoStatus } from "@/lib/api";
import { base, plural } from "@/lib/format";
import { hint } from "@/lib/keys";
import { recentRepos } from "@/lib/repos";
import type { RepoRow, RepoStatus, Snapshot } from "@/lib/types";
import { InfoTip, PICKER_GROUP, PickerItem } from "./PickerItem";

// The list gets a search field once it is longer than this.
const SEARCH_FROM = 6;

interface Props {
  snap: Snapshot;
  switching: boolean; // another repo or branch is being opened
  onOpenRepo: (path: string) => void;
  onOpenFolder: () => void;
}

// A repo row's value for the list's search and keyboard position: its name and folder.
const rowValue = (row: RepoRow) => `${row.name} ${row.path}`;

// Repos agents have worked in on this machine. Picking one loads it. When the list opens, each repo's checked-out
// branch and uncommitted files are read (one quick git status each), for the count of changed files.
export function RepoPicker({ snap, switching, onOpenRepo, onOpenFolder }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Record<string, RepoStatus>>({}); // by the repo's full path
  // Repos agents worked in, plus ones you opened yourself (Open folder…) that no agent session points to.
  const opened = recentRepos().filter((recent) => !snap.repos.some((repo) => repo.full === recent.path));
  const rows: RepoRow[] = [
    ...snap.repos,
    ...opened.map(({ path, at }) => ({
      name: base(path),
      path,
      full: path,
      sessions: 0,
      last: at,
      current: path === snap.path,
    })),
  ];
  const current = rows.find((row) => row.current);
  const onOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) return;
    loadRepoStatus(rows.map((row) => row.full)).then(
      (statuses) => setStatus(Object.fromEntries(statuses.map((repo) => [repo.full, repo]))),
      () => {},
    );
  };
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
        <Command defaultValue={current && rowValue(current)}>
          {rows.length > SEARCH_FROM && <CommandInput placeholder="Find a repository" />}
          <CommandList className="max-h-[max(18rem,50vh)]">
            <CommandEmpty>No repository matches</CommandEmpty>
            <CommandGroup
              heading={
                <span className="flex items-center gap-1.5">
                  Repositories
                  <InfoTip label="About this list">
                    Repositories Claude Code or Codex have worked in, plus ones you opened.
                  </InfoTip>
                </span>
              }
              className={PICKER_GROUP}
            >
              {rows.map((row) => {
                const changed = status[row.full]?.changed.length ?? 0;
                const count = row.current && openCount != null ? openCount : changed;
                return (
                  <PickerItem
                    key={row.full}
                    value={rowValue(row)}
                    on={row.current}
                    title={row.name}
                    files={{
                      n: count,
                      label: plural(count, "changed file"),
                      title: "Uncommitted changed files, as the Changes screen lists them",
                    }}
                    sub={<MiddlePath path={row.path} />}
                    onSelect={() => {
                      setOpen(false);
                      if (!row.current || switching) onOpenRepo(row.full);
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
