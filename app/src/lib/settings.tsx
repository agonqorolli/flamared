// App settings, kept on this machine. For now only how diffs look.
// Stored in the webview's storage; it moves to the app's data folder with the license work.
import { createContext, useCallback, useContext, useState } from "react";

export const DIFF_THEMES = [
  ["github-dark", "GitHub Dark"],
  ["github-dark-dimmed", "GitHub Dark Dimmed"],
  ["github-dark-default", "GitHub Dark Default"],
  ["pierre-dark", "Pierre Dark"],
  ["one-dark-pro", "One Dark Pro"],
  ["vitesse-dark", "Vitesse Dark"],
  ["tokyo-night", "Tokyo Night"],
  ["catppuccin-mocha", "Catppuccin Mocha"],
  ["dracula", "Dracula"],
  ["nord", "Nord"],
  ["night-owl", "Night Owl"],
  ["min-dark", "Min Dark"],
] as const;

export interface DiffSettings {
  theme: (typeof DIFF_THEMES)[number][0];
  layout: "unified" | "split";
  longLines: "scroll" | "wrap";
  inline: "word-alt" | "word" | "char" | "none"; // highlighting of the changed part inside a line
  markers: "classic" | "bars" | "none";
  backgrounds: boolean;
  lineNumbers: boolean;
  fontSize: 11 | 12 | 13 | 14;
}

export interface Settings {
  diff: DiffSettings;
}

export const DEFAULTS: Settings = {
  diff: { theme: "github-dark", layout: "unified", longLines: "scroll", inline: "word-alt", markers: "classic", backgrounds: true, lineNumbers: true, fontSize: 12 },
};

const KEY = "settings";
const load = (): Settings => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { diff: { ...DEFAULTS.diff, ...saved.diff } };
  } catch {
    return DEFAULTS;
  }
};

const Ctx = createContext<{ settings: Settings; setDiff: (patch: Partial<DiffSettings>) => void; resetDiff: () => void } | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(load);
  const save = useCallback((next: Settings) => {
    setSettings(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* kept for this session only */
    }
  }, []);
  const setDiff = useCallback((patch: Partial<DiffSettings>) => save({ ...settings, diff: { ...settings.diff, ...patch } }), [settings, save]);
  const resetDiff = useCallback(() => save({ ...settings, diff: DEFAULTS.diff }), [settings, save]);
  return <Ctx.Provider value={{ settings, setDiff, resetDiff }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSettings needs a SettingsProvider");
  return v;
}
