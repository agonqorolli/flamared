import { useEffect, useRef, useState } from "react";
import { SideColumn } from "@/components/SideColumn";
import { FileDiffIcon, MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KeyHint } from "@/components/KeyHint";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { DiffView } from "@/components/DiffView";
import { FileCard } from "@/components/FileCard";
import { MiniCard, MiniRow } from "@/components/MiniCard";
import { SectionLabel } from "@/components/SectionLabel";
import { Counts, StatusLetter } from "@/components/StatusLetter";
import { Said } from "@/components/Said";
import { SessionsInfo } from "./SessionsInfo";
import { SurvivalTag } from "@/components/SurvivalTag";
import { base, day, plural, SURVIVAL, time } from "@/lib/format";
import { editKey, editPatch, ms, editStatus, editStatusTip, type Timeline, type TimelineItem, type TimelineRow } from "@/lib/timeline";
import { cn } from "@/lib/utils";
import { hint, useKeys } from "@/lib/keys";
import type { Snapshot, TimelineEdit } from "@/lib/types";

interface Props {
  snap: Snapshot;
  timeline: Timeline;
  active: boolean;
  focus: { path: string; n: number } | null; // "Show in Timeline" from another screen: the file's latest edit
  inChanges: (path: string) => boolean;
  onShowInChanges: (path: string) => void;
  onShowInMap: (path: string) => void;
  fresh: Set<string>; // edits that arrived since you last selected them (editKey)
  onSeen: (key: string) => void;
}

// Timeline: every agent edit in order (latest first) with the agent's words, commands and your prompts around it.
export function TimelineView({ snap, timeline, active, focus, inChanges, onShowInChanges, onShowInMap, fresh, onSeen }: Props) {
  const { items, edits } = timeline;
  const hasWords = items.some((it) => it.kind === "turn" && it.rows.some((r) => r.kind === "say"));
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

  // J / K step through edits, A shows the agent's messages, C / M jump to the file while it is still changed.
  const stillChanged = !!e && inChanges(e.path);
  useKeys(active, {
    next: () => setSelected(sel + 1),
    prev: () => setSelected(sel - 1),
    agent: hasWords && (() => setShowAgent(!showAgent)),
    toChanges: stillChanged && (() => onShowInChanges(e.path)),
    toMap: stillChanged && (() => onShowInMap(e.path)),
  });

  return (
    <div className="flex min-h-0 flex-1">
      <nav aria-label="Agent edits" className="flex w-(--list-w) min-w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={showAgent && hasWords ? "agent" : "edits"} onValueChange={(v) => v && setShowAgent(v === "agent")}>
            <ToggleGroupItem value="edits">Edits</ToggleGroupItem>
            <ToggleGroupItem value="agent" disabled={!hasWords} title={hasWords ? `Show the agent's messages between the edits (${hint("agent")})` : "No agent messages in these turns"}>
              Edits + Agent
              <KeyHint id="agent" />
            </ToggleGroupItem>
          </ToggleGroup>
          <span className="flex items-center gap-1 text-xs text-faint">
            {plural(edits.length, "edit")}
            <SessionsInfo snap={snap} />
          </span>
        </div>
        <ScrollArea className="min-h-0 flex-1 px-3 [&_[data-slot=scroll-area-viewport]>div]:!block">
          {!edits.length && <p className="px-1.5 pt-4 text-xs text-faint">No matching agent turns. Showing commits only.</p>}
          {/* One section per day, laid out like the groups in Changes: the day's label, then its cards 8px apart. */}
          <div className="flex flex-col pb-10">
            {byDay(items).map(({ label, items: day }, d) => (
              <section key={label ?? d} aria-label={label ?? undefined}>
                {label && <SectionLabel>{label}</SectionLabel>}
                <div className="flex flex-col gap-2">
                  {day.map((it, k) => (
                    <Item key={it.kind === "turn" ? it.key : `${it.kind}-${k}`} item={it} selected={sel} showAgent={showAgent && hasWords} fresh={fresh} onSelect={setSelected} />
                  ))}
                </div>
              </section>
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
          onShowInMap={() => onShowInMap(e.path)}
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

// The list split at each day label: the turns and commits under it.
function byDay(items: TimelineItem[]) {
  const days: { label: string | null; items: TimelineItem[] }[] = [];
  for (const it of items) {
    if (it.kind === "day" || !days.length) days.push({ label: it.kind === "day" ? it.label : null, items: [] });
    if (it.kind !== "day") days[days.length - 1].items.push(it);
  }
  return days;
}

function Item({ item, selected, showAgent, fresh, onSelect }: { item: TimelineItem; selected: number; showAgent: boolean; fresh: Set<string>; onSelect: (i: number) => void }) {
  if (item.kind === "day") return null;
  if (item.kind === "commit")
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-input px-2.5 py-2 text-xs text-muted-foreground">
        <span className="font-mono">{item.sha}</span>
        <span className="min-w-0 flex-1 truncate">{item.subject}</span>
        <span className="text-faint">{time(item.at)}</span>
      </div>
    );
  // Edits only by default; with the agent, its messages too.
  const rows = item.rows.filter((r) => r.kind === "edit" || showAgent);
  const start = time(item.at);
  return (
    <article className="overflow-hidden rounded-lg border bg-card" aria-label={`${item.agent}: ${item.prompt}`}>
      {/* Newest first, like the whole list: the edits on top, and at the bottom your prompt that started the turn. */}
      <div className="flex flex-col p-1.5">
        {rows.map((r, k) => (
          <TurnRow key={k} row={r} agent={item.agent} selected={selected} fresh={fresh} onSelect={onSelect} />
        ))}
      </div>
      <footer className="border-t bg-raised/40 px-3 py-2">
        <Said who="You" when={start} text={item.prompt} />
      </footer>
    </article>
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
      <div className="px-1.5 py-1">
        <Said who={agent} when="" text={row.text} />
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
      <span className="w-9 shrink-0 text-micro text-faint">{time(e.at)}</span>
      <StatusLetter status={editStatus(e)} title={editStatusTip(e)} />
      <span className="min-w-0 flex-1 truncate font-mono font-medium">{base(e.path)}</span>
      {fresh.has(editKey(e)) && <span className="size-1.5 shrink-0 rounded-full bg-selection" title="New since you last looked" />}
      {!e.inferred && <Counts add={e.add} rem={e.rem} />}
    </button>
  );
}

function EditDetail({ edit: e, index, edits, inChanges, onSelect, onShowInChanges, onShowInMap }: {
  edit: TimelineEdit;
  index: number;
  edits: TimelineEdit[];
  inChanges: boolean; // still changed: Changes and the Map have it
  onSelect: (i: number) => void;
  onShowInChanges: () => void;
  onShowInMap: () => void;
}) {
  // This file's edits (latest first), and other files edited in the same step (between the same two agent messages).
  const history = edits.map((x, j) => [x, j] as const).filter(([x]) => x.path === e.path).sort(([a], [b]) => ms(b.at) - ms(a.at));
  const together = edits
    .map((x, j) => [x, j] as const)
    .filter(([x], j) => j !== index && x.step === e.step && x.path !== e.path)
    .filter(([x], k, arr) => arr.findIndex(([y]) => y.path === x.path) === k);
  // The date only shows when the entries span several days.
  const multiDay = new Set(history.map(([x]) => day(x.at))).size > 1;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-3 p-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DiffView id={`${index}`} patch={editPatch(e)} empty={e.inferred ? "The agent's command writes this file, but Codex didn't record a diff. See Changes for the current diff." : "No diff recorded for this edit"} />
      </div>
      <SideColumn label="Edit and related edits">
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
              <>
                <Button variant="outline" size="icon-xs" aria-label="Show in Changes" title={`Show in Changes (${hint("toChanges")})`} onClick={onShowInChanges}>
                  <FileDiffIcon />
                  <KeyHint id="toChanges" />
                </Button>
                <Button variant="outline" size="icon-xs" aria-label="Show in Map" title={`Show in Map (${hint("toMap")})`} onClick={onShowInMap}>
                  <MapIcon />
                  <KeyHint id="toMap" />
                </Button>
              </>
            )
          }
        />
        <MiniCard title={`File history · ${history.length}`} empty="">
          {history.map(([x, j]) => (
            <MiniRow
              key={j}
              on={j === index}
              onClick={() => onSelect(j)}
              title={`${day(x.at)} ${time(x.at)}${x.survives ? ` · ${SURVIVAL[x.survives][0]}` : ""}${x.inferred ? " · No diff recorded" : ` · +${x.add} −${x.rem}`}\n${x.say ? `“${x.say}”` : "No message"}`}
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
            <MiniRow key={j} onClick={() => onSelect(j)} title={`${x.path}${x.inferred ? " · No diff recorded" : ` · +${x.add} −${x.rem}`}`}>
              <span className="truncate font-mono font-medium">{base(x.path)}</span>
            </MiniRow>
          ))}
        </MiniCard>
      </SideColumn>
    </div>
  );
}
