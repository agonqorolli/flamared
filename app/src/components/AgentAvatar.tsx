import { cn } from "@/lib/utils";

// Each agent gets its initial in the avatar; the color is the shared AI color.
const INITIAL: Record<string, string> = { "Claude Code": "C", Codex: "X" };

export function AgentAvatar({ agent, className }: { agent: string | null; className?: string }) {
  return (
    <span
      className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-ai-bg text-[9px] font-semibold text-ai-foreground", className)}
      aria-hidden
    >
      {INITIAL[agent ?? ""] ?? "A"}
    </span>
  );
}
