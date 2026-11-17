import { KeyHint } from "@/components/KeyHint";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hint } from "@/lib/keys";
import { cn } from "@/lib/utils";
import type { Waiting } from "@/lib/waiting";

export interface Live {
  on: boolean;
  updating: boolean; // a reload is running
  pending: Waiting | null; // what is waiting while paused
  set: (on: boolean) => void;
}

// Live: the screens update by themselves when files or agent sessions change. Paused holds them still and says
// when changes are waiting.
export function LiveToggle({ on, updating, pending, set }: Live) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={on}
          onClick={() => set(!on)}
          className="text-xs text-muted-foreground"
        >
          <span className="relative flex size-2">
            {on && updating && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-add opacity-75" />
            )}
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                on ? "bg-add" : pending ? "bg-warn" : "bg-faint",
              )}
            />
          </span>
          {on ? "Live" : pending ? `Paused · ${pending.label}` : "Paused"}
          <KeyHint id="live" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64 flex-col items-start gap-1">
        <LiveHelp on={on} pending={pending} />
      </TooltipContent>
    </Tooltip>
  );
}

// The tooltip: what Live does, or what is waiting while paused, and the keys for both.
function LiveHelp({ on, pending }: Pick<Live, "on" | "pending">) {
  if (on) {
    return `Updates by itself when files change or an agent works in this repo. Click or press ${hint("live")} to pause. ${hint("reload")} reloads now.`;
  }
  if (!pending) {
    return `Not updating by itself. Click or press ${hint("live")} to go live, or reload once (${hint("reload")}).`;
  }
  return (
    <>
      <span>Waiting while paused:</span>
      {pending.details.map((detail) => (
        <span key={detail}>· {detail}</span>
      ))}
      <span className="text-muted-foreground">
        Click or press {hint("live")} to go live and load them, or reload once ({hint("reload")}).
      </span>
    </>
  );
}
