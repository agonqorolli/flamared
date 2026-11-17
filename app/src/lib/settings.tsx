// App settings, kept on this machine: how the app looks (theme, density) and how diffs look.
// Saved in the app's data folder (see store.ts).
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getItem, setItem } from "./store";

const inTauri = "__TAURI_INTERNALS__" in window;

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

// The theme the window shows; the setting can also be "system", which picks one of these.
export type Theme = "dark" | "gray" | "light";

export interface AppearanceSettings {
  theme: Theme | "system";
  density: "compact" | "normal" | "spacious";
}

export interface Settings {
  appearance: AppearanceSettings;
  diff: DiffSettings;
}

export const DEFAULTS: Settings = {
  appearance: { theme: "gray", density: "normal" },
  diff: { theme: "github-dark", layout: "unified", longLines: "scroll", inline: "word-alt", markers: "classic", backgrounds: true, lineNumbers: true, fontSize: 12 },
};

const KEY = "settings";
const load = (): Settings => {
  try {
    const saved = JSON.parse(getItem(KEY) || "{}");
    return { appearance: { ...DEFAULTS.appearance, ...saved.appearance }, diff: { ...DEFAULTS.diff, ...saved.diff } };
  } catch {
    return DEFAULTS;
  }
};

// System follows macOS: Gray when it's dark (the default dark look), Light when it's light. Once the window's
// theme is unset (below), the web view's color scheme is macOS's.
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const resolveTheme = (t: AppearanceSettings["theme"]): Theme => (t === "system" ? (systemDark.matches ? "gray" : "light") : t);

interface Api {
  settings: Settings;
  theme: Theme; // the setting resolved, for anything that colors itself
  setDiff: (patch: Partial<DiffSettings>) => void;
  resetDiff: () => void;
  setAppearance: (patch: Partial<AppearanceSettings>) => void;
  resetAppearance: () => void;
}
const Ctx = createContext<Api | null>(null);

// The theme and density live on <html>: `dark` (shadcn's dark tokens) for Dark and Gray, `gray` on top for Gray,
// and data-density, which sets the spacing scale (see index.css).
function applyAppearance(a: AppearanceSettings) {
  const theme = resolveTheme(a.theme);
  const root = document.documentElement;
  root.classList.toggle("dark", theme !== "light");
  root.classList.toggle("gray", theme === "gray");
  root.dataset.density = a.density;
  root.style.colorScheme = theme === "light" ? "light" : "dark";
  // The header doubles as the title bar (see Header.tsx); the window buttons on it follow macOS's appearance unless
  // told otherwise, so match them to the theme, or leave them to macOS for System.
  if (inTauri) getCurrentWindow().setTheme(a.theme === "system" ? null : theme === "light" ? "light" : "dark").catch(() => {});
}

// Called once before the first render, so the window opens in the saved theme instead of flashing dark first.
export const applySavedAppearance = () => applyAppearance(load().appearance);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(load);
  const save = useCallback((next: Settings) => {
    setSettings(next);
    try {
      setItem(KEY, JSON.stringify(next));
    } catch {
      /* kept for this session only */
    }
  }, []);
  const setDiff = useCallback((patch: Partial<DiffSettings>) => save({ ...settings, diff: { ...settings.diff, ...patch } }), [settings, save]);
  const resetDiff = useCallback(() => save({ ...settings, diff: DEFAULTS.diff }), [settings, save]);
  const setAppearance = useCallback((patch: Partial<AppearanceSettings>) => save({ ...settings, appearance: { ...settings.appearance, ...patch } }), [settings, save]);
  const resetAppearance = useCallback(() => save({ ...settings, appearance: DEFAULTS.appearance }), [settings, save]);
  const [dark, setDark] = useState(systemDark.matches);
  useEffect(() => {
    const onChange = () => setDark(systemDark.matches);
    systemDark.addEventListener("change", onChange);
    return () => systemDark.removeEventListener("change", onChange);
  }, []);
  useEffect(() => applyAppearance(settings.appearance), [settings.appearance, dark]);
  const theme = resolveTheme(settings.appearance.theme);
  return <Ctx.Provider value={{ settings, theme, setDiff, resetDiff, setAppearance, resetAppearance }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSettings needs a SettingsProvider");
  return v;
}
