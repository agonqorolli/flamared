import { FoldButton, useFold } from "@/components/FoldButton";
import { FreshDot, ListRow } from "@/components/ListRow";
import { Said } from "@/components/Said";
import { SectionLabel } from "@/components/SectionLabel";
import { Counts, StatusLetter } from "@/components/StatusLetter";
import { base, time } from "@/lib/format";
import { editKey, editStatus, editStatusTip, type TimelineItem, type TimelineRow } from "@/lib/timeline";
import { byDay, type TurnOrCommit } from "./model";

interface Props {
  items: TimelineItem[];
  hasEdits: boolean;
  selected: number; // the selected edit's position in the list of edits
  showAgent: boolean;
  fresh: Set<string>;
  onSelect: (index: number) => void;
}

// The Timeline list: one section per day, laid out like the groups in Changes: the day's label, then its cards
// 8px apart.
export function TimelineList({ items, hasEdits, ...list }: Props) {
  return (
    <>
      {!hasEdits && <p className="px-1.5 pt-4 text-xs text-faint">No matching agent turns. Showing commits only.</p>}
      <div className="flex flex-col pb-10">
        {byDay(items).map((day, d) => (
          <section key={day.label ?? d} aria-label={day.label ?? undefined}>
            {day.label && <SectionLabel>{day.label}</SectionLabel>}
            <div className="flex flex-col gap-2">
              {day.items.map((item, k) => (
                <Item key={item.kind === "turn" ? item.key : `${item.kind}-${k}`} item={item} {...list} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

type ItemProps = Omit<Props, "items" | "hasEdits">;
type TurnItem = Extract<TurnOrCommit, { kind: "turn" }>;

// A commit as one dashed line, or a turn as a card.
function Item({ item, ...list }: { item: TurnOrCommit } & ItemProps) {
  if (item.kind === "commit") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-input px-2.5 py-2 text-xs text-muted-foreground">
        <span className="font-mono">{item.sha}</span>
        <span className="min-w-0 flex-1 truncate">{item.subject}</span>
        <span className="text-faint">{time(item.at)}</span>
      </div>
    );
  }
  return <Turn turn={item} {...list} />;
}

// A turn as a card: its edits (and, with the agent, its messages), then your prompt in the footer with the button that
// folds the card down to it.
function Turn({ turn, selected, showAgent, fresh, onSelect }: { turn: TurnItem } & ItemProps) {
  // Edits only by default; with the agent, its messages too.
  const rows = turn.rows.filter((row) => row.kind === "edit" || showAgent);
  const edits = turn.rows.filter((row) => row.kind === "edit").length;
  const { folded, toggle } = useFold(selected, (index) =>
    turn.rows.some((row) => row.kind === "edit" && row.index === index),
  );
  return (
    <article className="overflow-hidden rounded-lg border bg-card" aria-label={`${turn.agent}: ${turn.prompt}`}>
      {/* Newest first, like the whole list: the edits on top, and at the bottom your prompt that started the turn. */}
      {!folded && (
        <div className="flex flex-col border-b p-1.5">
          {rows.map((row, k) => (
            <TurnRow key={k} row={row} agent={turn.agent} selected={selected} fresh={fresh} onSelect={onSelect} />
          ))}
        </div>
      )}
      {/* items-start: an opened prompt grows downward and the chevron stays beside its first line. */}
      <footer className="flex items-start gap-2 bg-raised/40 px-3 py-2">
        <Said who="You" when={time(turn.at)} text={turn.prompt} lines={1} />
        <FoldButton folded={folded} count={edits} unit="edit" rows="above" className="-mt-0.5" onToggle={toggle} />
      </footer>
    </article>
  );
}

interface TurnRowProps {
  row: TimelineRow;
  agent: string;
  selected: number;
  fresh: Set<string>;
  onSelect: (index: number) => void;
}

// One row of a turn: something the agent said, or an edit (time, status letter, file name, line counts).
function TurnRow({ row, agent, selected, fresh, onSelect }: TurnRowProps) {
  if (row.kind === "say") {
    return (
      <div className="px-1.5 py-1">
        <Said who={agent} when="" text={row.text} />
      </div>
    );
  }
  const edit = row.edit;
  return (
    <ListRow on={row.index === selected} title={edit.path} onClick={() => onSelect(row.index)}>
      {/* Left out when the list is dragged narrow, so the file name keeps the room. */}
      <span className="w-9 shrink-0 text-micro text-faint @max-[13rem]:hidden">{time(edit.at)}</span>
      <StatusLetter status={editStatus(edit)} title={editStatusTip(edit)} />
      <span className="min-w-0 flex-1 truncate font-mono font-medium">{base(edit.path)}</span>
      {fresh.has(editKey(edit)) && <FreshDot title="New since you last looked" />}
      {!edit.inferred && <Counts add={edit.add} rem={edit.rem} />}
    </ListRow>
  );
}
