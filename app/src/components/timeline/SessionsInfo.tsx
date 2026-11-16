import { InfoIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { plural } from "@/lib/format";
import type { Snapshot } from "@/lib/types";

// The ⓘ next to the edit count in Timeline: which agent sessions fed the list, how they were matched to this
// branch, and what was left out.
export function SessionsInfo({ snap }: { snap: Snapshot }) {
  const L = snap.timeline.link;
  const S = snap.timeline.sessions;
  const where = `${L.branch || "this working folder"} since ${L.base}`;
  const left = Object.entries(L.skipped);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex size-4 items-center justify-center rounded-full text-faint hover:text-foreground"
          aria-label={S.length ? `From ${plural(S.length, "agent session")}: which ones?` : "No agent sessions: why?"}
        >
          <InfoIcon className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] gap-3">
        <PopoverHeader>
          <PopoverTitle>{S.length ? `${plural(S.length, "agent session")} on ${where}` : `No agent session on ${where}`}</PopoverTitle>
          <PopoverDescription>
            {S.length
              ? "The Claude Code and Codex conversations these edits and messages come from."
              : L.sessions_in_repo
                ? `${plural(L.sessions_in_repo, "session")} worked in this repo, but none edited files on this branch that are still changed. Changes still works; the agent's words are just missing.`
                : "No coding agent session (Claude Code, Codex) has worked in this repo on this machine. Changes still works from git alone."}
          </PopoverDescription>
        </PopoverHeader>
        {S.length > 0 && (
          <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto text-xs">
            {S.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-subtle" title={s.title}>
                  {s.title}
                </span>
                <span className="shrink-0 text-faint">
                  {s.agent} · {plural(s.turns.length, "turn")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t pt-2.5 text-xs leading-snug text-muted-foreground">
          A turn counts when it ran in this repo (or another working folder for it), edited files on this branch after the branch point, and those files are still changed.
          {left.length > 0 && ` Left out: ${left.map(([k, n]) => `${n} ${k}`).join(", ")}.`}
        </p>
      </PopoverContent>
    </Popover>
  );
}
