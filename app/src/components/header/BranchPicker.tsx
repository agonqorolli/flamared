import { ChevronDownIcon, GitBranchIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { loadBranchFiles, loadRepoStatus } from "@/lib/api";
import { plural } from "@/lib/format";
import type { BranchFiles, BranchRow, RepoStatus, Snapshot } from "@/lib/types";
import { InfoTip, PICKER_GROUP, PickerItem } from "./PickerItem";

// The list gets a search field once it is longer than this.
const SEARCH_FROM = 6;

interface Props {
  snap: Snapshot;
  disabled: boolean; // while another repo is being opened
  switching: boolean; // another repo or branch is being opened
  onViewBranch: (branch: string | null) => void;
}

// Branches of this repo. Viewing is read-only. When the list opens, each other branch's changed files are counted
// (as viewing it would show them), and the checked-out branch's files to check.
export function BranchPicker({ snap, disabled, switching, onViewBranch }: Props) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<Record<string, BranchFiles>>({}); // by branch name
  const [checkedOut, setCheckedOut] = useState<RepoStatus | null>(null); // the checked-out branch, while another is viewed
  const local = snap.branches.filter((branch) => !branch.remote);
  const remote = snap.branches.filter((branch) => branch.remote);
  const viewing = snap.viewing.branch;
  const onOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) return;
    loadBranchFiles(snap.path).then(setFiles, () => {});
    if (!snap.viewing.checked_out) {
      loadRepoStatus([snap.path]).then(
        (statuses) => setCheckedOut(statuses[0] ?? null),
        () => {},
      );
    }
  };
  const checkedOutCount = snap.viewing.checked_out ? snap.stats.files : (checkedOut?.changed.length ?? 0);

  // The badge of a branch: how many files, and what they are counted against.
  const filesOf = (branch: BranchRow) => {
    const counted = files[branch.name];
    const n = branch.current ? checkedOutCount : (counted?.n ?? 0);
    const against = branch.current ? null : counted?.against;
    if (against) {
      return {
        n,
        label: `${plural(n, "file")} vs ${against}`,
        title: `Files changed since this branch split from ${against}, as the preview shows them`,
      };
    }
    const title = branch.current
      ? "Uncommitted changed files, as the Changes screen lists them"
      : "Uncommitted changed files in its worktree";
    return { n, label: plural(n, "changed file"), title };
  };

  const groups = [
    { label: "Local", branches: local },
    { label: "Remote", branches: remote },
  ].filter((group) => group.branches.length);
  return (
    <Popover open={open && !disabled} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="max-w-56 font-medium"
          title={snap.viewing.checked_out ? `Working folder: ${viewing}` : `Previewing ${viewing}`}
        >
          <GitBranchIcon data-icon="inline-start" />
          <span className="truncate">{viewing}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[380px] p-0">
        <Command defaultValue={viewing}>
          {snap.branches.length > SEARCH_FROM && <CommandInput placeholder="Find a branch" />}
          <CommandList className="max-h-[max(18rem,50vh)]">
            <CommandEmpty>No branch matches</CommandEmpty>
            {groups.map(({ label, branches }, i) => (
              <CommandGroup
                key={label}
                heading={
                  <span className="flex items-center gap-1.5">
                    {remote.length ? label : "Branches"}
                    {i === 0 && (
                      <InfoTip label="About previewing a branch">
                        Shows a branch's changes without checking it out. Everything here is read-only; you can't edit
                        it in the app.
                      </InfoTip>
                    )}
                  </span>
                }
                className={PICKER_GROUP}
              >
                {branches.map((branch) => (
                  <PickerItem
                    key={branch.name}
                    value={branch.name}
                    on={branch.name === viewing}
                    title={branch.name}
                    files={filesOf(branch)}
                    sub={<LastCommit branch={branch} />}
                    onSelect={() => {
                      setOpen(false);
                      if (branch.name !== viewing || switching) onViewBranch(branch.current ? null : branch.name);
                    }}
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Under a branch name: its last commit's subject, on one truncated line. Nothing for a branch without one, though
// the row keeps the line's place.
function LastCommit({ branch }: { branch: BranchRow }) {
  return branch.subject ? <span className="block truncate">{branch.subject}</span> : null;
}
