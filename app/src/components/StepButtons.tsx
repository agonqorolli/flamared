import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { KeyHint } from "@/components/KeyHint";
import { Button } from "@/components/ui/button";
import { hint } from "@/lib/keys";

interface Props {
  what: "File" | "Edit";
  index: number;
  count: number;
  onStep: (dir: 1 | -1) => void;
}

// Previous and next, side by side across the full width of the side column, above its first card (J / K on the
// keyboard). When the column is dragged narrow, the words are left out and only the arrows stay.
export function StepButtons({ what, index, count, onStep }: Props) {
  const noun = what.toLowerCase();
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        variant="outline"
        size="sm"
        className="min-w-0 flex-1"
        aria-label={`Previous ${noun}`}
        title={`Previous ${noun} (${hint("prev")})`}
        disabled={index <= 0}
        onClick={() => onStep(-1)}
      >
        <ArrowUpIcon data-icon="inline-start" />
        <span className="@max-[11rem]:hidden">Previous</span>
        <KeyHint id="prev" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="min-w-0 flex-1"
        aria-label={`Next ${noun}`}
        title={`Next ${noun} (${hint("next")})`}
        disabled={index >= count - 1}
        onClick={() => onStep(1)}
      >
        <span className="@max-[11rem]:hidden">Next</span>
        <ArrowDownIcon data-icon="inline-end" />
        {/* The button is flush with the column's right edge, and the column clips (it scrolls): keep the badge inside. */}
        <KeyHint id="next" className="right-0" />
      </Button>
    </div>
  );
}
