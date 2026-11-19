import { FoldButton, useFold } from "@/components/FoldButton";
import { FreshDot, ListRow } from "@/components/ListRow";
import { Said } from "@/components/Said";
import { SectionLabel } from "@/components/SectionLabel";
import { Counts, StatusLetter } from "@/components/StatusLetter";
import { base, STATUS } from "@/lib/format";
import type { ReviewState } from "@/lib/review";
import type { FileInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Block, Row, Section } from "./model";

interface Props {
  sections: Section[];
  selected: number; // the selected row's position in the flat list
  showAgent: boolean;
  fresh: Set<string>;
  reviewOf: (file: FileInfo) => ReviewState | null;
  onSelect: (index: number) => void;
}

// The Changes list: each section's label, then its groups as cards, 8px apart.
export function ChangesList({ sections, ...list }: Props) {
  return (
    <div className="flex flex-col pb-10">
      {sections.map((section) => (
        <section key={section.label} aria-label={section.label}>
          <SectionLabel tip={section.tip}>{section.label}</SectionLabel>
          <div className="flex flex-col gap-2">
            {section.blocks.map((block) => (
              <GroupBlock key={block.key} block={block} {...list} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// One group as a card: its name with a button to fold it, the agent's latest message about it (when asked for), and
// its files.
function GroupBlock({
  block,
  selected,
  showAgent,
  fresh,
  reviewOf,
  onSelect,
}: { block: Block } & Omit<Props, "sections">) {
  const holds = (index: number) => block.rows.some((row) => row.index === index);
  const { folded, toggle } = useFold(selected, holds, block.folded);
  return (
    <div className={cn("rounded-lg border bg-card p-1.5", block.lonely && "border-warn/30")}>
      {/* The group's name and the fold button; the longer description is on hover. */}
      <div className="flex items-center justify-between gap-2 pt-0.5 pb-1 pl-1.5" title={block.sub}>
        <span className="min-w-0 truncate font-mono text-name font-medium text-foreground">{block.name}</span>
        <FoldButton folded={folded} count={block.rows.length} onToggle={toggle} />
      </div>
      {!folded && showAgent && block.words && (
        <div className="px-1.5 py-1">
          <Said who={block.words_agent ?? "Agent"} text={block.words} />
        </div>
      )}
      {!folded &&
        block.rows.map((row) => (
          <FileRow
            key={row.index}
            row={row}
            on={row.index === selected}
            fresh={fresh.has(row.file.path)}
            review={reviewOf(row.file)}
            onSelect={onSelect}
          />
        ))}
      {!folded && block.lonely && (
        <div className="px-1.5 pt-1 text-mini text-warn">Not connected to the other changes</div>
      )}
    </div>
  );
}

interface FileRowProps {
  row: Row;
  on: boolean;
  fresh: boolean;
  review: ReviewState | null;
  onSelect: (index: number) => void;
}

// One changed file: its status letter, name and line counts, tinted by its review mark.
function FileRow({ row, on, fresh, review, onSelect }: FileRowProps) {
  const file = row.file;
  return (
    <ListRow
      on={on}
      data-review={review ?? undefined}
      title={file.path}
      onClick={() => onSelect(row.index)}
      className={cn(
        // Marks: "Looks good" rows dim green, "Needs work" rows dim red.
        review === "approved" && "bg-add/[.07] hover:bg-add/[.12]",
        review === "rejected" && "bg-rem/[.07] hover:bg-rem/[.12]",
        on && review === "approved" && "bg-add/[.16] shadow-[inset_2px_0_0_var(--add)] hover:bg-add/[.16]",
        on && review === "rejected" && "bg-rem/[.16] shadow-[inset_2px_0_0_var(--rem)] hover:bg-rem/[.16]",
      )}
    >
      <span className={cn("contents", review && !on && "[&>*]:opacity-55")}>
        <StatusLetter status={file.status} title={STATUS[file.status]} />
        <span className="min-w-0 flex-1 truncate font-mono font-medium">{base(file.path)}</span>
        {fresh && <FreshDot title="New or changed since you last looked" />}
        {file.binary ? (
          <span className="shrink-0 text-mini text-faint">binary</span>
        ) : (
          <Counts add={file.add} rem={file.rem} />
        )}
      </span>
    </ListRow>
  );
}
