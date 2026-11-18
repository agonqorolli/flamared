// New versions: the app looks for one on start (unless turned off in Settings → Updates) or when asked, installs it
// in the background, and offers a restart. Only in the app; the browser preview has nothing to update.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { appVersion, installUpdate, inTauri, restartApp } from "./api";
import { useSettings } from "./settings";

export const canUpdate = inTauri;

export type UpdateState =
  | { phase: "idle" } // not checked yet
  | { phase: "checking" }
  | { phase: "downloading"; version: string }
  | { phase: "ready"; version: string } // installed; it runs after a restart
  | { phase: "current" } // this is the newest version
  | { phase: "failed"; reason: string };

interface UpdatesApi {
  version: string | null; // this app's version; null in the browser preview
  state: UpdateState;
  busy: boolean; // checking or downloading
  checkNow: () => void;
  restart: () => void;
}
const UpdatesContext = createContext<UpdatesApi | null>(null);

export function UpdatesProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [version, setVersion] = useState<string | null>(null);
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  // A ref, not the state: React runs effects twice in development, and two checks must not overlap.
  const running = useRef(false);

  const checkNow = useCallback(() => {
    if (!canUpdate || running.current) return;
    running.current = true;
    setState({ phase: "checking" });
    installUpdate((found) => setState({ phase: "downloading", version: found }))
      .then((installed) => setState(installed ? { phase: "ready", version: installed } : { phase: "current" }))
      .catch((error: unknown) => setState({ phase: "failed", reason: String(error) }))
      .finally(() => {
        running.current = false;
      });
  }, []);

  const checkOnStart = settings.updates.checkOnStart;
  const startChecked = useRef(false);
  useEffect(() => {
    if (startChecked.current) return;
    startChecked.current = true;
    if (canUpdate) appVersion().then(setVersion);
    if (checkOnStart) checkNow();
  }, [checkOnStart, checkNow]);

  const busy = state.phase === "checking" || state.phase === "downloading";
  return (
    <UpdatesContext.Provider value={{ version, state, busy, checkNow, restart: restartApp }}>
      {children}
    </UpdatesContext.Provider>
  );
}

export function useUpdates() {
  const updates = useContext(UpdatesContext);
  if (!updates) throw new Error("useUpdates needs an UpdatesProvider");
  return updates;
}
