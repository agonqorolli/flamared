import { useEffect, useRef, useState } from "react";
import { LayersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { AgentAvatar } from "@/components/AgentAvatar";
import { DiffView } from "@/components/DiffView";
import { FileCard } from "@/components/FileCard";
import { MiniCard, MiniRow } from "@/components/MiniCard";
import { SectionLabel } from "@/components/SectionLabel";
import { Counts, StatusLetter } from "@/components/StatusLetter";
import { SurvivalTag } from "@/components/SurvivalTag";
import { base, day, plural, SURVIVAL, time } from "@/lib/format";
import { editKey, editPatch, editStatus, editStatusTip, type Timeline, type TimelineItem, type TimelineRow } from "@/lib/timeline";
import { cn } from "@/lib/utils";
import type { TimelineEdit } from "@/lib/types";

interface Props {
  timeline: Timeline;
  active: boolean;
  focus: { path: string; n: number } | null; // "Show in Timeline" from another screen: the file's latest edit
  inChanges: (path: string) => boolean;
  onShowInChanges: (path: string) => void;
  fresh: Set<string>; // edits that arrived since you last selected them (editKey)
  onSeen: (key: string) => void;
}

// Timeline: every agent edit in order (latest first) with the agent's words, commands and your prompts around it.
export function TimelineView({ timeline, active, focus, inChanges, onShowInChanges, fresh, onSeen }: Props) {
  const { items, edits } = timeline;
  // The selection follows the edit, so new edits arriving at the top don't move you.
  const [selected, setSelectedState] = useState<{ key: string | null; index: number }>({ key: null, index: 0 });
  const [showAgent, setShowAgent] = useState(false);
  const byKey = selected.key ? edits.findIndex((x) => editKey(x) === selected.key) : -1;
  const sel = byKey >= 0 ? byKey : Math.min(selected.index, Math.max(0, edits.length - 1));
  const e = edits[sel];
  const setSelected = (i: number) => {
    const x = edits[Math.max(0, Math.min(edits.length - 1, i))];
    if (!x) return;
    const k = editKey(x);
    setSelectedState({ key: k, index: i });
    onSeen(k);
  };

  useEffect(() => {
    if (!focus) return;
    const i = edits.findIndex((x) => x.path === focus.path); // edits are latest first
    if (i >= 0) setSelected(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  useEffect(() => {
    if (!active) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || (ev.target as HTMLElement).closest("input, textarea, [cmdk-root]")) return;
      if (ev.key !== "j" && ev.key !== "k") return;
      ev.preventDefault();
      setSelected(sel + (ev.key === "j" ? 1 : -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex min-h-0 flex-1">
      <nav aria-label="Agent edits" className="flex w-[300px] min-w-[240px] shrink-0 flex-col border-r bg-sidebar">
        <div className="flex items-center justify-between gap-2 px-3 pt-3.5">
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={showAgent ? "agent" : "edits"} onValueChange={(v) => v && setShowAgent(v === "agent")}>
            <ToggleGroupItem value="edits">Edits</ToggleGroupItem>
            <ToggleGroupItem value="agent">Edits + Agent</ToggleGroupItem>
          </ToggleGroup>
          <span className="text-xs text-faint">{plural(edits.length, "edit")}</span>
        </div>
        <ScrollArea className="min-h-0 flex-1 px-3 [&_[data-slot=scroll-area-viewport]>div]:!block">
          {!edits.length && <p className="px-1.5 pt-4 text-xs text-faint">No matching agent turns. Showing commits only.</p>}
          <div className="flex flex-col gap-2 pb-10">
            {items.map((it, k) => (
              <Item key={it.kind === "turn" ? it.key : `${it.kind}-${k}`} item={it} selected={sel} showAgent={showAgent} fresh={fresh} onSelect={setSelected} />
            ))}
          </div>
        </ScrollArea>
      </nav>
      {e ? (
        <EditDetail
          key={editKey(e)}
          edit={e}
          index={sel}
          edits={edits}
          inChanges={inChanges(e.path)}
          onSelect={setSelected}
          onShowInChanges={() => onShowInChanges(e.path)}
        />
      ) : (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyTitle>No agent edits</EmptyTitle>
            <EmptyDescription>No Claude Code or Codex turn edited files that are still in this change.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

function Item({ item, selected, showAgent, fresh, onSelect }: { item: TimelineItem; selected: number; showAgent: boolean; fresh: Set<string>; onSelect: (i: number) => void }) {
  if (item.kind === "day") return <SectionLabel>{item.label}</SectionLabel>;
  if (item.kind === "commit")
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-input px-2.5 py-2 text-xs text-muted-foreground">
        <span className="font-mono">{item.sha}</span>
        <span className="min-w-0 flex-1 truncate">{item.subject}</span>
        <span className="text-faint">{time(item.at)}</span>
      </div>
    );
  // Edits only by default; with the agent, its messages and test runs (plain lookups stay hidden).
  const rows = item.rows.filter((r) => r.kind === "edit" || (showAgent && (r.kind === "say" || r.test)));
  return (
    <div className="rounded-lg border bg-card p-1.5">
      {rows.map((r, k) => (
        <TurnRow key={k} row={r} agent={item.agent} selected={selected} fresh={fresh} onSelect={onSelect} />
      ))}
      <div className={cn("flex flex-col gap-1 px-1.5 pt-2 pb-0.5", rows.length && "mt-1.5 border-t")}>
        <div className="flex items-baseline gap-1.5 text-[11px] text-muted-foreground">
          <span>{time(item.at)}</span>·<span className="text-ai-foreground">{item.agent}</span>·<span className="min-w-0 flex-1 truncate">{item.title}</span>
          <span>{plural(item.edits, "edit")}</span>
        </div>
        <div className="flex items-start gap-2 text-[13px] leading-snug">
          <span className="mt-0.5 shrink-0 rounded-[3px] bg-subtle px-1 text-[9px] font-semibold text-background">YOU</span>
          <span className="line-clamp-3">{item.prompt}</span>
        </div>
      </div>
    </div>
  );
}

function TurnRow({ row, agent, selected, fresh, onSelect }: { row: TimelineRow; agent: string; selected: number; fresh: Set<string>; onSelect: (i: number) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const on = row.kind === "edit" && row.index === selected;
  useEffect(() => {
    if (on) ref.current?.scrollIntoView({ block: "nearest" });
  }, [on]);
  if (row.kind === "say")
    return (
      <div className="flex items-start gap-2 px-1.5 py-1 text-xs leading-snug text-muted-foreground">
        <AgentAvatar agent={agent} className="mt-0.5" />
        <span className="line-clamp-2">{row.text}</span>
      </div>
    );
  if (row.kind === "run")
    return (
      <div className="flex items-center gap-2 px-1.5 py-1 font-mono text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">$ {row.cmd}</span>
        <span className={cn("shrink-0 font-sans text-[11px]", row.failed ? "text-rem" : "text-add")}>
          {row.failed ? "failed" : row.passed != null ? `${row.passed} passed` : "test"}
        </span>
      </div>
    );
  const e = row.edit;
  return (
    <button
      ref={ref}
      onClick={() => onSelect(row.index)}
      aria-current={on || undefined}
      title={e.path}
      className={cn(
        "flex min-h-7 w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-xs text-subtle hover:bg-raised",
        on && "bg-selection-bg text-accent-foreground shadow-[inset_2px_0_0_var(--selection)] hover:bg-selection-bg",
      )}
    >
      <span className="w-9 shrink-0 text-[10px] text-faint">{time(e.at)}</span>
      <StatusLetter status={editStatus(e)} title={editStatusTip(e)} />
      <span className="min-w-0 flex-1 truncate font-mono font-medium">{base(e.path)}</span>
      {fresh.has(editKey(e)) && <span className="size-1.5 shrink-0 rounded-full bg-selection" title="New since you last looked" />}
      <Counts add={e.add} rem={e.rem} />
    </button>
  );
}

function EditDetail({ edit: e, index, edits, inChanges, onSelect, onShowInChanges }: {
  edit: TimelineEdit;
  index: number;
  edits: TimelineEdit[];
  inChanges: boolean;
  onSelect: (i: number) => void;
  onShowInChanges: () => void;
}) {
  // This file's edits (latest first), and other files edited in the same step (between the same two agent messages).
  const history = edits.map((x, j) => [x, j] as const).filter(([x]) => x.path === e.path).sort(([a], [b]) => (b.at || "").localeCompare(a.at || ""));
  const together = edits
    .map((x, j) => [x, j] as const)
    .filter(([x], j) => j !== index && x.step === e.step && x.path !== e.path)
    .filter(([x], k, arr) => arr.findIndex(([y]) => y.path === x.path) === k);
  // The date only shows when the entries span several days.
  const multiDay = new Set(history.map(([x]) => day(x.at))).size > 1;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-3 px-6 pt-2.5 pb-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DiffView id={`${index}`} patch={editPatch(e)} empty="No diff recorded for this edit" />
        {e.via && <p className="mt-2 truncate font-mono text-xs text-faint" title={e.via}>made by $ {e.via}</p>}
      </div>
      <aside aria-label="Edit and related edits" className="flex w-[clamp(180px,26%,220px)] shrink-0 flex-col gap-3 overflow-y-auto">
        <FileCard
          what="Edit"
          index={index}
          count={edits.length}
          path={e.path}
          agent={e.agent}
          words={e.say}
          wordsLabel="before this edit"
          onStep={(d) => onSelect(Math.max(0, Math.min(edits.length - 1, index + d)))}
          jump={
            inChanges && (
              <Button variant="outline" size="icon-xs" aria-label="Show in Changes" title="Show in Changes" onClick={onShowInChanges}>
                <LayersIcon />
              </Button>
            )
          }
        />
        <MiniCard title={`File history · ${history.length}`} empty="">
          {history.map(([x, j]) => (
            <MiniRow
              key={j}
              on={j === index}
              onClick={() => onSelect(j)}
              title={`${day(x.at)} ${time(x.at)}${x.survives ? ` · ${SURVIVAL[x.survives][0]}` : ""} · +${x.add} −${x.rem}\n${x.say ? `“${x.say}”` : "No message"}`}
            >
              <span className="min-w-0 flex-1 truncate text-faint">
                {multiDay ? `${day(x.at)} ` : ""}
                {time(x.at)}
              </span>
              <SurvivalTag survives={x.survives} />
            </MiniRow>
          ))}
        </MiniCard>
        <MiniCard title={`Same step · ${together.length}`} empty="No other files in this step">
          {together.map(([x, j]) => (
            <MiniRow key={j} onClick={() => onSelect(j)} title={`${x.path} · +${x.add} −${x.rem}`}>
              <span className="truncate font-mono font-medium">{base(x.path)}</span>
            </MiniRow>
          ))}
        </MiniCard>
      </aside>
    </div>
  );
}
