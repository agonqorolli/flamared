import { InfoIcon } from "lucide-react";
import { Eyebrow } from "@/components/Eyebrow";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TIPS, type TipKey } from "@/lib/format";

// Small uppercase label for a section, with an ⓘ that explains it when the section has a tip. One line; a long
// label is cut short when the list is narrow, the ⓘ stays.
export function SectionLabel({ children, tip }: { children: React.ReactNode; tip?: TipKey }) {
  return (
    <Eyebrow className="flex items-center gap-1.5 px-1.5 pt-4 pb-1.5 leading-4">
      <span className="truncate" title={typeof children === "string" ? children : undefined}>{children}</span>
      {tip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-faint hover:text-foreground" aria-label={`What is “${children}”?`}>
              <InfoIcon className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-64 flex-col items-start gap-1 normal-case">
            <b className="font-semibold">{TIPS[tip][0]}</b>
            <span>{TIPS[tip][1]}</span>
          </TooltipContent>
        </Tooltip>
      )}
    </Eyebrow>
  );
}
