import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Said } from "@/components/Said";
import { base, dir } from "@/lib/format";

interface Props {
  what: "File" | "Edit";
  index: number;
  count: number;
  path: string;
  binary?: boolean;
  agent: string | null;
  words: string | null;
  wordsLabel: string;
  jump?: React.ReactNode; // a button to the same file in the other screen
  onStep: (dir: 1 | -1) => void;
}

// The head of the column beside a diff: which item of how many, ↑↓, a jump to the other screen, the file,
// and the agent's last message before the change (four lines, click for all). Line counts stay in the left list.
export function FileCard({ what, index, count, path, binary, agent, words, wordsLabel, jump, onStep }: Props) {
  const noun = what.toLowerCase();
  return (
    <section aria-label={what} className="flex flex-col gap-2.5 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium tracking-[.06em] text-faint uppercase">
          {what} <b className="text-foreground">{index + 1}</b> of {count}
        </span>
        <Button variant="outline" size="icon-xs" aria-label={`Previous ${noun}`} title={`Previous ${noun} (K)`} disabled={index <= 0} onClick={() => onStep(-1)}>
          <ArrowUpIcon />
        </Button>
        <Button variant="outline" size="icon-xs" aria-label={`Next ${noun}`} title={`Next ${noun} (J)`} disabled={index >= count - 1} onClick={() => onStep(1)}>
          <ArrowDownIcon />
        </Button>
        {jump && (
          <>
            <Separator orientation="vertical" className="mx-0.5 data-vertical:h-4 data-vertical:self-center" />
            {jump}
          </>
        )}
      </div>
      <div title={path} className="min-w-0">
        <h2 className="font-mono text-sm font-medium [overflow-wrap:anywhere]">{base(path)}</h2>
        {dir(path) && (
          <div className="truncate text-left font-mono text-[11px] text-faint [direction:rtl]">
            <bdi>{dir(path)}</bdi>
          </div>
        )}
      </div>
      {binary && <div className="text-xs text-faint">Binary file</div>}
      {words && <Said who={agent ?? "Agent"} text={words} lines={4} title={`${agent ?? "The agent"}'s last message ${wordsLabel}. Click to show all of it.`} />}
    </section>
  );
}
