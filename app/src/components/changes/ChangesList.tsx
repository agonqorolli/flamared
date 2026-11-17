import { useEffect, useRef } from "react";
import { Said } from "@/components/Said";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/SectionLabel";
import { Counts, StatusLetter } from "@/components/StatusLetter";
import { plural, STATUS } from "@/lib/format";
import type { ReviewState } from "@/lib/review";
import type { FileInfo } from "@/lib/types";
import type { Block, Row, Section } from "./model";

interface Props {
  sections: Section[];
  selected: number;
  showAgent: boolean;
  fresh: Set<string>;
  reviewOf: (f: FileInfo) => ReviewState | null;
  onSelect: (i: number) => void;
}

export function ChangesList({ sections, selected, showAgent, fresh, reviewOf, onSelect }: Props) {
  return (
    <div className="flex flex-col pb-10">
      {sections.map((s) => (
        <section key={s.label} aria-label={s.label}>
          <SectionLabel tip={s.tip}>{s.label}</SectionLabel>
          <div className="flex flex-col gap-2">
            {s.blocks.map((b) => (
              <GroupBlock
                key={b.key}
                block={b}
                selected={selected}
                showAgent={showAgent}
                fresh={fresh}
                reviewOf={reviewOf}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function GroupBlock({
  block,
  selected,
  showAgent,
  fresh,
  reviewOf,
  onSelect,
}: { block: Block } & Omit<Props, "sections">) {
  return (
    <div className={cn("rounded-lg border bg-card p-1.5", block.lonely && "border-warn/30")}>
      {/* The group's name and how many files it has; the longer description is on hover. */}
      <div className="flex items-baseline justify-between gap-2 px-1.5 pt-0.5 pb-1" title={block.sub}>
        <span className="min-w-0 truncate font-mono text-name font-medium text-foreground">{block.name}</span>
        <span className="shrink-0 text-mini text-faint">{plural(block.rows.length, "file")}</span>
      </div>
      {showAgent && block.words && (
        <div className="px-1.5 py-1">
          <Said who={block.words_agent ?? "Agent"} text={block.words} />
        </div>
      )}
      {block.rows.map((r) => (
        <FileRow
          key={r.index}
          row={r}
          on={r.index === selected}
          fresh={fresh.has(r.file.path)}
          review={reviewOf(r.file)}
          onSelect={onSelect}
        />
      ))}
      {block.lonely && <div className="px-1.5 pt-1 text-mini text-warn">Not connected to the other changes</div>}
    </div>
  );
}

function FileRow({
  row,
  on,
  fresh,
  review,
  onSelect,
}: {
  row: Row;
  on: boolean;
  fresh: boolean;
  review: ReviewState | null;
  onSelect: (i: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (on) ref.current?.scrollIntoView({ block: "nearest" });
  }, [on]);
  const f = row.file;
  return (
    <button
      ref={ref}
      data-review={review ?? undefined}
      aria-current={on || undefined}
      title={f.path}
      onClick={() => onSelect(row.index)}
      className={cn(
        "group/row flex min-h-7 w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-xs text-subtle hover:bg-raised",
        // Marks: "Looks good" rows dim green, "Needs work" rows dim red.
        review === "approved" && "bg-add/[.07] hover:bg-add/[.12]",
        review === "rejected" && "bg-rem/[.07] hover:bg-rem/[.12]",
        on && "bg-selection-bg text-accent-foreground shadow-[inset_2px_0_0_var(--selection)] hover:bg-selection-bg",
        on && review === "approved" && "bg-add/[.16] shadow-[inset_2px_0_0_var(--add)] hover:bg-add/[.16]",
        on && review === "rejected" && "bg-rem/[.16] shadow-[inset_2px_0_0_var(--rem)] hover:bg-rem/[.16]",
      )}
    >
      <span className={cn("contents", review && !on && "[&>*]:opacity-55")}>
        <StatusLetter status={f.status} title={STATUS[f.status]} />
        <span className="min-w-0 flex-1 truncate font-mono font-medium">
          {f.path.slice(f.path.lastIndexOf("/") + 1)}
        </span>
        {fresh && (
          <span className="size-1.5 shrink-0 rounded-full bg-selection" title="New or changed since you last looked" />
        )}
        {f.binary ? <span className="shrink-0 text-mini text-faint">binary</span> : <Counts add={f.add} rem={f.rem} />}
      </span>
    </button>
  );
}
