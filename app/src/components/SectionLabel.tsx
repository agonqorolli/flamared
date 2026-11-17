import type { ReactNode } from "react";
import { Eyebrow } from "@/components/Eyebrow";
import { InfoButton } from "@/components/InfoButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type TipKey, TIPS } from "@/lib/format";

// Small uppercase label for a section, with an ⓘ that explains it when the section has a tip. One line; a long
// label is cut short when the list is narrow, the ⓘ stays.
export function SectionLabel({ children, tip }: { children: ReactNode; tip?: TipKey }) {
  return (
    <Eyebrow className="flex items-center gap-1.5 px-1.5 pt-4 pb-1.5 leading-4">
      <span className="truncate" title={typeof children === "string" ? children : undefined}>
        {children}
      </span>
      {tip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoButton className="shrink-0" aria-label={`What is “${children}”?`} />
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-64 flex-col items-start gap-1 normal-case">
            <b className="font-semibold">{TIPS[tip].title}</b>
            <span>{TIPS[tip].text}</span>
          </TooltipContent>
        </Tooltip>
      )}
    </Eyebrow>
  );
}
