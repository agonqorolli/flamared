import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Eyebrow } from "@/components/Eyebrow";
import { KeyHint } from "@/components/KeyHint";
import { Said } from "@/components/Said";
import { Button } from "@/components/ui/button";
import { base, dir } from "@/lib/format";

interface Props {
  what: "File" | "Edit";
  index?: number;
  count?: number;
  path: string;
  binary?: boolean;
  agent: string | null;
  words: string | null;
  wordsLabel: string;
  jump?: ReactNode; // buttons to the same file on the other screens
  onBack?: () => void; // the map's panel: back to its overview instead of the count
}

// The head of the column beside a diff: which item of how many ("5 of 25"), a jump to the other screen, the file, and
// the agent's last message before the change (four lines, click for all). Line counts stay in the left list; previous
// and next are above the card (StepButtons). In the map's panel there is no list to step through:
// "← Overview" takes the place of the count. When the side column is dragged narrow, "5 of 25" is left out.
export function FileCard({ what, index = 0, count = 0, path, binary, agent, words, wordsLabel, jump, onBack }: Props) {
  return (
    <section aria-label={what} className="flex flex-col gap-2.5 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-1 @max-[11rem]:justify-between">
        {!onBack ? (
          <Eyebrow
            as="span"
            className="min-w-0 flex-1 truncate @max-[11rem]:hidden"
            title={`${what} ${index + 1} of ${count}`}
          >
            <b className="text-foreground">{index + 1}</b> of {count}
          </Eyebrow>
        ) : (
          <span className="flex-1">
            <Button variant="outline" size="xs" onClick={onBack}>
              <ArrowLeftIcon data-icon="inline-start" />
              Overview
              <KeyHint id="back" />
            </Button>
          </span>
        )}
        {jump && <span className="ml-auto flex gap-1">{jump}</span>}
      </div>
      <div title={path} className="min-w-0">
        <h2 className="truncate font-mono text-sm font-medium">{base(path)}</h2>
        {dir(path) && (
          <div className="truncate text-left font-mono text-mini text-faint [direction:rtl]">
            <bdi>{dir(path)}</bdi>
          </div>
        )}
      </div>
      {binary && <div className="text-xs text-faint">Binary file</div>}
      {words && (
        <Said
          who={agent ?? "Agent"}
          text={words}
          lines={4}
          title={`${agent ?? "The agent"}'s last message ${wordsLabel}. Click to show all of it.`}
        />
      )}
    </section>
  );
}
