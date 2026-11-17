import { SURVIVAL, type Survival } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE: Record<Survival, string> = {
  kept: "bg-add-bg text-add",
  partly: "bg-warn/10 text-warn",
  gone: "bg-raised text-faint",
  undone: "bg-raised text-faint",
};

// Whether an edit is still in the file, as a small colored tag; nothing when that isn't known.
export function SurvivalTag({ survives }: { survives: Survival | null }) {
  if (!survives) return null;
  return (
    <span
      className={cn("shrink-0 rounded-full px-1.5 py-px text-micro whitespace-nowrap", TONE[survives])}
      title={SURVIVAL[survives].tip}
    >
      {SURVIVAL[survives].label}
    </span>
  );
}
