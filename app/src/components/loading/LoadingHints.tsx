import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { HINTS, nextHint } from "./hints";
import type { LoadingScreen } from "./useLoadingScreen";

// In place of the screens while a repo or branch opens: a spinner and a hint about the app. Each hint stays up for
// as long as it takes to read, then another, picked at random, rolls in.
export function LoadingHints({ screen }: { screen: LoadingScreen }) {
  const [index, setIndex] = useState(screen.first);
  const hint = HINTS[index];
  useEffect(() => {
    const timer = setTimeout(() => setIndex(nextHint()), hint.seconds * 1000);
    return () => clearTimeout(timer);
  }, [hint]);

  const { opening } = screen;
  return (
    <div className="flex flex-1 animate-in flex-col items-center justify-center gap-5 p-3 duration-300 fade-in">
      <Spinner
        className="size-5 text-faint"
        aria-label={`${opening.repoChanged ? "Opening" : "Loading"} ${opening.label}`}
      />
      <div
        key={index}
        aria-live="polite"
        className="flex max-w-sm animate-in flex-col items-center gap-1.5 text-center duration-500 fade-in slide-in-from-bottom-2"
      >
        <p className="text-base font-medium">{hint.title}</p>
        <p className="text-sm/relaxed text-balance text-subtle">{hint.text}</p>
      </div>
    </div>
  );
}
