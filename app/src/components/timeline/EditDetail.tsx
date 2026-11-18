import { DiffView } from "@/components/DiffView";
import { FileCard } from "@/components/FileCard";
import { JumpButton } from "@/components/JumpButton";
import { MiniCard, MiniRow } from "@/components/MiniCard";
import { SideColumn } from "@/components/SideColumn";
import { StepButtons } from "@/components/StepButtons";
import { SurvivalTag } from "@/components/SurvivalTag";
import { base, day, SURVIVAL, time } from "@/lib/format";
import { editPatch } from "@/lib/timeline";
import type { TimelineEdit } from "@/lib/types";
import { clamp } from "@/lib/utils";
import { fileHistory, sameStep } from "./model";

interface Props {
  edit: TimelineEdit;
  index: number;
  edits: TimelineEdit[];
  inChanges: boolean; // still changed: Changes and the Map have it
  onSelect: (index: number) => void;
  onShowInChanges: () => void;
  onShowInMap: () => void;
}

// For a row's hover text: the edit's line counts, or that it has none.
const diffSummary = (edit: TimelineEdit) => (edit.inferred ? " · No diff recorded" : ` · +${edit.add} −${edit.rem}`);

// The selected edit: its diff, and beside it the edit's card, the file's other edits and the files edited with it.
export function EditDetail({ edit, index, edits, inChanges, onSelect, onShowInChanges, onShowInMap }: Props) {
  const history = fileHistory(edits, edit.path);
  const together = sameStep(edits, index);
  // The date only shows when the entries span several days.
  const multiDay = new Set(history.map((entry) => day(entry.edit.at))).size > 1;
  const noDiff = edit.inferred
    ? "The agent's command writes this file, but Codex didn't record a diff. See Changes for the current diff."
    : "No diff recorded for this edit";
  const historyTitle = (entry: TimelineEdit) => {
    const survives = entry.survives ? ` · ${SURVIVAL[entry.survives].label}` : "";
    const said = entry.say ? `“${entry.say}”` : "No message";
    return `${day(entry.at)} ${time(entry.at)}${survives}${diffSummary(entry)}\n${said}`;
  };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-3 p-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DiffView id={`${index}`} patch={editPatch(edit)} empty={noDiff} />
      </div>
      <SideColumn label="Edit and related edits">
        <StepButtons
          what="Edit"
          index={index}
          count={edits.length}
          onStep={(step) => onSelect(clamp(index + step, 0, edits.length - 1))}
        />
        <FileCard
          what="Edit"
          index={index}
          count={edits.length}
          path={edit.path}
          agent={edit.agent}
          words={edit.say}
          wordsLabel="before this edit"
          jump={
            inChanges && (
              <>
                <JumpButton to="changes" onClick={onShowInChanges} />
                <JumpButton to="map" onClick={onShowInMap} />
              </>
            )
          }
        />
        <MiniCard title={`File history · ${history.length}`}>
          {history.map((entry) => (
            <MiniRow
              key={entry.index}
              on={entry.index === index}
              onClick={() => onSelect(entry.index)}
              title={historyTitle(entry.edit)}
            >
              <span className="min-w-0 flex-1 truncate text-faint">
                {multiDay ? `${day(entry.edit.at)} ` : ""}
                {time(entry.edit.at)}
              </span>
              <SurvivalTag survives={entry.edit.survives} />
            </MiniRow>
          ))}
        </MiniCard>
        <MiniCard title={`Same step · ${together.length}`} empty="No other files in this step">
          {together.map((other) => (
            <MiniRow
              key={other.index}
              onClick={() => onSelect(other.index)}
              title={`${other.edit.path}${diffSummary(other.edit)}`}
            >
              <span className="truncate font-mono font-medium">{base(other.edit.path)}</span>
            </MiniRow>
          ))}
        </MiniCard>
      </SideColumn>
    </div>
  );
}
