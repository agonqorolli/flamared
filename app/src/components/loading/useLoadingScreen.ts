import { useEffect, useState } from "react";
import type { Opening } from "@/lib/live";
import { HINTS, nextHint } from "./hints";

// The loading screen while it is up: what is opening, the hint it starts with, and the earliest it may go.
export interface LoadingScreen {
  opening: Opening;
  first: number; // index into HINTS
  until: number; // Date.now() before which it stays up
}

function start(opening: Opening): LoadingScreen {
  const first = nextHint();
  return { opening, first, until: Date.now() + HINTS[first].seconds * 1000 };
}

// The loading screen for `opening`: up while a repo or branch opens, and kept until its first hint has had time to
// be read, so a fast load doesn't cut it off mid-sentence.
export function useLoadingScreen(opening: Opening | null): LoadingScreen | null {
  const [screen, setScreen] = useState<LoadingScreen | null>(null);
  useEffect(() => {
    if (opening) {
      // Picking the first hint deals it from the deck, so it happens here, once, not in a state updater.
      if (!screen) setScreen(start(opening));
      else if (screen.opening !== opening) setScreen({ ...screen, opening });
      return;
    }
    if (!screen) return;
    const timer = setTimeout(() => setScreen(null), Math.max(0, screen.until - Date.now()));
    return () => clearTimeout(timer);
  }, [opening, screen]);
  return screen;
}
