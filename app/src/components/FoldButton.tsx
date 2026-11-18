import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon } from "lucide-react";
import { useState } from "react";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  folded: boolean;
  count: number; // how many rows the card hides, for the label
  unit?: "file" | "edit" | "command";
  rows?: "below" | "above"; // where the rows it hides sit: the open chevron points at them
  className?: string;
  onToggle: () => void;
}

// The bare chevron that folds a card in a left list (a group in Changes, a turn in Timeline). No fill: shadcn's
// ghost button fills itself while aria-expanded is set. Open, it points at its rows; folded, it points right.
export function FoldButton({ folded, count, unit = "file", rows = "below", className, onToggle }: Props) {
  const label = `${folded ? "Show" : "Hide"} ${plural(count, unit)}`;
  const OpenChevron = rows === "above" ? ChevronUpIcon : ChevronDownIcon;
  const Chevron = folded ? ChevronRightIcon : OpenChevron;
  return (
    <button
      type="button"
      className={cn(
        "-my-1 grid size-5 shrink-0 place-items-center rounded-md text-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      aria-label={label}
      aria-expanded={!folded}
      title={label}
      onClick={onToggle}
    >
      <Chevron className="size-3.5" />
    </button>
  );
}

// Whether a card is folded. Stepping onto one of its rows (J / K, or from another screen) opens it again, so the
// selection stays visible.
export function useFold(selected: number, holds: (index: number) => boolean) {
  const [folded, setFolded] = useState(false);
  const [seen, setSeen] = useState(selected);
  if (seen !== selected) {
    setSeen(selected);
    if (folded && holds(selected)) setFolded(false);
  }
  return { folded, toggle: () => setFolded(!folded) };
}
