import type { ReactNode } from "react";
import { APP_NAME } from "@/brand";
import { KeyForm, type Purchase } from "./KeyForm";

interface Props {
  title: string;
  text: ReactNode;
  purchase: Purchase;
  children?: ReactNode; // under the key form
}

// Shown in place of the app while it needs a key: why, where to paste one, and that the key is checked on this Mac.
export function LockScreen({ title, text, purchase, children }: Props) {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-background p-6">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-xl border bg-card p-7">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-faint">{APP_NAME}</div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
        </div>
        <KeyForm purchase={purchase} autoFocus />
        {children}
        <p className="border-t pt-4 text-xs leading-snug text-faint">
          The key is checked on this Mac. Your code and agent sessions never leave it.
        </p>
      </div>
    </div>
  );
}
