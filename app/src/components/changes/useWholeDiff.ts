// Show all for a diff cut at 2,000 lines: the whole diff of the version on screen, loaded from the Rust side when
// asked for. Once asked, it stays whole for that file: when the agent changes the file again and you show the newer
// version, its whole diff is loaded too.
import { useEffect, useState } from "react";
import { linesLeftOut } from "./model";

export interface WholeDiff {
  text: string; // what to draw: the whole diff once loaded, else the (maybe cut) one from the snapshot
  left: number | null; // lines left out of what is drawn; null when nothing is
  loading: boolean;
  error: string | null;
  showAll: () => void;
}

export function useWholeDiff(path: string, shown: string, load: (path: string) => Promise<string>): WholeDiff {
  const [asked, setAsked] = useState<string | null>(null); // the file you asked to see whole
  const [whole, setWhole] = useState<{ path: string; cut: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // Show all again after an error tries again
  const left = linesLeftOut(shown);
  // The cut text names the whole diff it was cut from (a hash on its last line), so it identifies the version.
  const ready = whole && whole.path === path && whole.cut === shown ? whole.text : null;
  const wanted = asked === path && left !== null && ready === null;

  useEffect(() => {
    if (!wanted) return;
    let current = true;
    load(path).then(
      (text) => current && setWhole({ path, cut: shown, text }),
      (e: unknown) => current && setError(String(e)),
    );
    return () => {
      current = false;
    };
  }, [wanted, path, shown, load, attempt]);

  return {
    text: ready ?? shown,
    left: ready === null ? left : null,
    loading: wanted && !error,
    error: asked === path ? error : null,
    showAll: () => {
      setError(null);
      setAsked(path);
      setAttempt((count) => count + 1);
    },
  };
}
