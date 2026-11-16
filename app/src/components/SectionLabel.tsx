import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TIPS, type TipKey } from "@/lib/format";

// Small uppercase label for a section, with an ⓘ that explains it when the section has a tip.
export function SectionLabel({ children, tip }: { children: React.ReactNode; tip?: TipKey }) {
  return (
    <div className="flex items-center gap-1.5 px-1.5 pt-4 pb-1.5 text-[10px] font-medium tracking-[.06em] text-faint uppercase">
      {children}
      {tip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="inline-flex size-4 items-center justify-center rounded-full text-faint hover:text-foreground" aria-label={`What is “${children}”?`}>
              <InfoIcon className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-64 flex-col items-start gap-1 normal-case">
            <b className="font-semibold">{TIPS[tip][0]}</b>
            <span>{TIPS[tip][1]}</span>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
