import { useEffect, useState } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { HINTS, nextHint } from "./hints";
import { LogoLoader } from "./LogoLoader";
import type { LoadingScreen } from "./useLoadingScreen";

// In place of the screens while a repo or branch opens: the animated logo and a hint about the app, laid out like the other
// centered screens (no changes, couldn't read). Each hint stays up for as long as it takes to read, then another,
// picked at random, rolls in.
export function LoadingHints({ screen }: { screen: LoadingScreen }) {
  const [index, setIndex] = useState(screen.first);
  const hint = HINTS[index];
  useEffect(() => {
    const timer = setTimeout(() => setIndex(nextHint()), hint.seconds * 1000);
    return () => clearTimeout(timer);
  }, [hint]);

  const { opening } = screen;
  return (
    <Empty className="flex-1 animate-in duration-300 fade-in">
      <EmptyMedia>
        <LogoLoader label={`${opening.repoChanged ? "Opening" : "Loading"} ${opening.label}`} />
      </EmptyMedia>
      <EmptyHeader key={index} aria-live="polite" className="animate-in duration-500 fade-in slide-in-from-bottom-2">
        <EmptyTitle>{hint.title}</EmptyTitle>
        <EmptyDescription>{hint.text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
