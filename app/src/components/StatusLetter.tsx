import { cn } from "@/lib/utils";
import { STATUS } from "@/lib/format";
import type { Status } from "@/lib/types";

const COLOR: Record<Status, string> = {
  A: "text-add",
  M: "text-warn",
  D: "text-rem",
  R: "text-renamed",
  T: "text-muted-foreground",
  U: "text-conflict",
  C: "text-renamed",
};

// The git status letter in front of a file name, colored, with what it means on hover.
export function StatusLetter({ status, title }: { status: Status; title?: string }) {
  return (
    <span
      className={cn("w-3 shrink-0 text-center font-mono text-mini font-semibold", COLOR[status])}
      title={title ?? STATUS[status]}
    >
      {status}
    </span>
  );
}

export function Counts({ add, rem }: { add: number; rem: number }) {
  return (
    <span className="shrink-0 font-mono text-mini whitespace-nowrap">
      <span className="text-add">+{add}</span> <span className="text-rem">−{rem}</span>
    </span>
  );
}
