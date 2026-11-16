import { cn } from "@/lib/utils";

// The small uppercase label over a section or card: "LOGIC GROUPS", "USES · 5", "1 OF 16". One look everywhere.
export function Eyebrow({ as: Tag = "div", className, ...props }: { as?: "div" | "span" | "h3" } & React.HTMLAttributes<HTMLElement>) {
  return <Tag className={cn("text-micro font-medium tracking-label text-faint uppercase", className)} {...props} />;
}
