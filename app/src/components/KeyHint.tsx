import { Kbd } from "@/components/ui/kbd";
import { keyParts, type KeyId } from "@/lib/keys";
import { cn } from "@/lib/utils";

// A button's key, pinned to its corner while ⌘ is held (lib/keys.ts useKeyHints). The button must be positioned
// (Button, Toggle and TabsTrigger are).
export function KeyHint({ id, className }: { id: KeyId; className?: string }) {
  return (
    <Kbd
      aria-hidden
      className={cn(
        "key-hint absolute -right-1.5 -bottom-1.5 z-30 h-4 min-w-4 rounded-[4px] bg-foreground px-1 text-micro text-background shadow-md",
        className,
      )}
    >
      {keyParts(id).join("")}
    </Kbd>
  );
}
