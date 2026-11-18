import {
  DatabaseIcon,
  GitCommitHorizontalIcon,
  GlobeIcon,
  type LucideIcon,
  PackageIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import type { EffectRun } from "@/lib/timeline";
import type { Effect } from "@/lib/types";
import { cn } from "@/lib/utils";

// Each effect's name, icon and color. Throwing work away and deleting files are red; the others only change what
// lives outside the repo's files, so they are a warning, and plain git (a commit, a branch switch) is quiet.
const EFFECT: Record<Effect, { label: string; icon: LucideIcon; color: string }> = {
  discard: { label: "threw away changes", icon: RotateCcwIcon, color: "text-rem" },
  delete: { label: "deleted files", icon: Trash2Icon, color: "text-rem" },
  database: { label: "database", icon: DatabaseIcon, color: "text-warn" },
  install: { label: "packages", icon: PackageIcon, color: "text-warn" },
  network: { label: "network", icon: GlobeIcon, color: "text-warn" },
  git: { label: "git", icon: GitCommitHorizontalIcon, color: "text-subtle" },
};
// The order of the table above, most serious first: the icon is the most serious effect's.
const SERIOUSNESS = Object.keys(EFFECT) as Effect[];

// For a row's hover text: the whole command, what the agent said it was for, and whether it failed.
export function effectTitle(run: EffectRun) {
  const result = run.failed ? "Failed (may not have happened)" : "Ran";
  return `${result}: ${run.cmd}${run.desc ? `\n${run.desc}` : ""}`;
}

// What a command changed outside the diff, in the order it did it: "Deleted files + git".
function effectLabel(effects: Effect[]) {
  const label = effects.map((effect) => EFFECT[effect].label).join(" + ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// The icon of a command's most serious effect, in its color, where an edit's status letter sits.
export function EffectIcon({ effects }: { effects: Effect[] }) {
  const worst = SERIOUSNESS.find((effect) => effects.includes(effect)) ?? "git";
  const { icon: Icon, color } = EFFECT[worst];
  return (
    <span className="grid w-3 shrink-0 place-items-center">
      <Icon className={cn("size-3", color)} aria-label={effectLabel(effects)} />
    </span>
  );
}

// A command that changed things outside the diff: its most serious effect's icon, what it changed, and "failed"
// when it exited with an error (it may not have happened).
export function EffectResult({ run }: { run: EffectRun }) {
  return (
    <>
      <EffectIcon effects={run.effects} />
      <span className="shrink-0 font-medium">{effectLabel(run.effects)}</span>
      {run.failed && <span className="shrink-0 text-faint">failed</span>}
    </>
  );
}
