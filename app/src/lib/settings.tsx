// App settings, kept on this machine: how the app looks (theme, density) and how diffs look.
// Stored in the webview's storage; it moves to the app's data folder with the license work.
import { createContext, useCallback, useContext, useEffect, useState } from "react";

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

// The light counterpart of each dark theme, used when the app is in Light mode.
export const LIGHT_THEME: Record<(typeof DIFF_THEMES)[number][0], string> = {
  "github-dark": "github-light",
  "github-dark-dimmed": "github-light",
  "github-dark-default": "github-light-default",
  "pierre-dark": "pierre-light",
  "one-dark-pro": "one-light",
  "vitesse-dark": "vitesse-light",
  "tokyo-night": "github-light",
  "catppuccin-mocha": "catppuccin-latte",
  dracula: "github-light",
  nord: "github-light",
  "night-owl": "night-owl-light",
  "min-dark": "min-light",
};

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

export interface AppearanceSettings {
  theme: "dark" | "gray" | "light";
  density: "compact" | "normal" | "spacious";
}

export interface Settings {
  appearance: AppearanceSettings;
  diff: DiffSettings;
}

export const DEFAULTS: Settings = {
  appearance: { theme: "dark", density: "normal" },
  diff: { theme: "github-dark", layout: "unified", longLines: "scroll", inline: "word-alt", markers: "classic", backgrounds: true, lineNumbers: true, fontSize: 12 },
};

const KEY = "settings";
const load = (): Settings => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { appearance: { ...DEFAULTS.appearance, ...saved.appearance }, diff: { ...DEFAULTS.diff, ...saved.diff } };
  } catch {
    return DEFAULTS;
  }
};

interface Api {
  settings: Settings;
  setDiff: (patch: Partial<DiffSettings>) => void;
  resetDiff: () => void;
  setAppearance: (patch: Partial<AppearanceSettings>) => void;
  resetAppearance: () => void;
}
const Ctx = createContext<Api | null>(null);

// The theme and density live on <html>: `dark` (shadcn's dark tokens) for Dark and Gray, `gray` on top for Gray,
// and data-density, which sets the spacing scale (see index.css).
function applyAppearance(a: AppearanceSettings) {
  const root = document.documentElement;
  root.classList.toggle("dark", a.theme !== "light");
  root.classList.toggle("gray", a.theme === "gray");
  root.dataset.density = a.density;
  root.style.colorScheme = a.theme === "light" ? "light" : "dark";
}

// Called once before the first render, so the window opens in the saved theme instead of flashing dark first.
export const applySavedAppearance = () => applyAppearance(load().appearance);

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
  const setAppearance = useCallback((patch: Partial<AppearanceSettings>) => save({ ...settings, appearance: { ...settings.appearance, ...patch } }), [settings, save]);
  const resetAppearance = useCallback(() => save({ ...settings, appearance: DEFAULTS.appearance }), [settings, save]);
  useEffect(() => applyAppearance(settings.appearance), [settings.appearance]);
  return <Ctx.Provider value={{ settings, setDiff, resetDiff, setAppearance, resetAppearance }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSettings needs a SettingsProvider");
  return v;
}
