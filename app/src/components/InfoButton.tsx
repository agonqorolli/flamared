import { InfoIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// The small ⓘ that opens an explanation. Wrap it in a tooltip's or popover's trigger (`asChild`).
export function InfoButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "inline-flex size-4 items-center justify-center rounded-full text-faint hover:text-foreground",
        className,
      )}
      {...props}
    >
      <InfoIcon className="size-3" />
    </button>
  );
}
