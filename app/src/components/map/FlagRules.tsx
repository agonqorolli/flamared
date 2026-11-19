import { InfoButton } from "@/components/InfoButton";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FLAG_RULES } from "@/lib/flags";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

// An ⓘ that opens the list of rules (lib/flags.ts); the ones turned off in Settings → Flags are dimmed and say so.
export function FlagRules({ label = "What gets flagged?" }: { label?: string }) {
  const off = useSettings().settings.flags.off;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <InfoButton className="shrink-0 align-[-3px]" aria-label={label} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] gap-3">
        <PopoverHeader>
          <PopoverTitle>Rules that flag a file</PopoverTitle>
          <PopoverDescription>
            Fixed patterns read from the change itself, no AI. A flag points at something worth a look, not a verdict.
          </PopoverDescription>
        </PopoverHeader>
        <dl className="flex max-h-[min(420px,60vh)] flex-col gap-2.5 overflow-y-auto text-xs">
          {FLAG_RULES.map(({ id, flag, when }) => (
            <div key={id} className={cn("flex flex-col gap-0.5", off.includes(id) && "opacity-50")}>
              <dt className="font-medium text-warn">
                {flag}
                {off.includes(id) && <span className="font-normal text-faint"> · off in Settings → Flags</span>}
              </dt>
              <dd className="leading-snug text-muted-foreground">{when}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
