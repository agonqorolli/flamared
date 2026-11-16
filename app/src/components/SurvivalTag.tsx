import { cn } from "@/lib/utils";
import { SURVIVAL, type Survival } from "@/lib/format";

const TONE: Record<Survival, string> = {
  kept: "bg-add-bg text-add",
  partly: "bg-warn/10 text-warn",
  gone: "bg-raised text-faint",
  undone: "bg-raised text-faint",
};

export function SurvivalTag({ survives }: { survives: Survival | null }) {
  if (!survives) return null;
  return (
    <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[10px] whitespace-nowrap", TONE[survives])} title={SURVIVAL[survives][1]}>
      {SURVIVAL[survives][0]}
    </span>
  );
}
