// App settings, kept on this machine: how the app looks (theme, density), how diffs look, checking for updates, and
// which flag rules are shown.
// Saved in the app's data folder (see store.ts).
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { inTauri, setWindowTheme } from "./api";
import type { FlagRuleId } from "./flags";
import { getJson, setJson } from "./store";

export const DIFF_THEMES = [
  { id: "github-dark", label: "GitHub Dark" },
  { id: "github-dark-dimmed", label: "GitHub Dark Dimmed" },
  { id: "github-dark-default", label: "GitHub Dark Default" },
  { id: "pierre-dark", label: "Pierre Dark" },
  { id: "one-dark-pro", label: "One Dark Pro" },
  { id: "vitesse-dark", label: "Vitesse Dark" },
  { id: "tokyo-night", label: "Tokyo Night" },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha" },
  { id: "dracula", label: "Dracula" },
  { id: "nord", label: "Nord" },
  { id: "night-owl", label: "Night Owl" },
  { id: "min-dark", label: "Min Dark" },
] as const;
export type DiffTheme = (typeof DIFF_THEMES)[number]["id"];

// The light counterpart of each dark theme, used when the app is in Light mode.
export const LIGHT_THEME: Record<DiffTheme, string> = {
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
  theme: DiffTheme;
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

export interface UpdateSettings {
  checkOnStart: boolean; // look for a new version each time the app opens
}

export interface FlagSettings {
  off: FlagRuleId[]; // rules whose flags aren't shown (Settings → Flags)
}

export interface Settings {
  appearance: AppearanceSettings;
  diff: DiffSettings;
  updates: UpdateSettings;
  flags: FlagSettings;
}

export const DEFAULTS: Settings = {
  appearance: { theme: "gray", density: "normal" },
  diff: {
    theme: "github-dark",
    layout: "unified",
    longLines: "scroll",
    inline: "word-alt",
    markers: "classic",
    backgrounds: true,
    lineNumbers: true,
    fontSize: 12,
  },
  updates: { checkOnStart: true },
  flags: { off: [] },
};

const SETTINGS_KEY = "settings";

// What is saved, with the default for anything that isn't.
function load(): Settings {
  const saved = getJson<Partial<Settings>>(SETTINGS_KEY, {});
  return {
    appearance: { ...DEFAULTS.appearance, ...saved.appearance },
    diff: { ...DEFAULTS.diff, ...saved.diff },
    updates: { ...DEFAULTS.updates, ...saved.updates },
    flags: { ...DEFAULTS.flags, ...saved.flags },
  };
}

// System follows macOS: Gray when it's dark (the default dark look), Light when it's light. Once the window's
// theme is unset (below), the web view's color scheme is macOS's.
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
function resolveTheme(setting: AppearanceSettings["theme"]): Theme {
  if (setting !== "system") return setting;
  return systemDark.matches ? "gray" : "light";
}

// The theme and density live on <html>: `dark` (shadcn's dark tokens) for Dark and Gray, `gray` on top for Gray,
// and data-density, which sets the spacing scale (see index.css).
function applyAppearance(appearance: AppearanceSettings) {
  const theme = resolveTheme(appearance.theme);
  const windowTheme = theme === "light" ? "light" : "dark";
  const root = document.documentElement;
  root.classList.toggle("dark", theme !== "light");
  root.classList.toggle("gray", theme === "gray");
  root.dataset.density = appearance.density;
  root.style.colorScheme = windowTheme;
  // The header doubles as the title bar (see Header.tsx); the window buttons on it follow macOS's appearance unless
  // told otherwise, so match them to the theme, or leave them to macOS for System.
  if (inTauri) setWindowTheme(appearance.theme === "system" ? null : windowTheme).catch(() => {});
}

// Called once before the first render, so the window opens in the saved theme instead of flashing dark first.
export const applySavedAppearance = () => applyAppearance(load().appearance);

interface SettingsApi {
  settings: Settings;
  theme: Theme; // the setting resolved, for anything that colors itself
  setDiff: (patch: Partial<DiffSettings>) => void;
  resetDiff: () => void;
  setAppearance: (patch: Partial<AppearanceSettings>) => void;
  resetAppearance: () => void;
  setUpdates: (patch: Partial<UpdateSettings>) => void;
  setFlags: (patch: Partial<FlagSettings>) => void;
}
const SettingsContext = createContext<SettingsApi | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(load);
  const save = useCallback((next: Settings) => {
    setSettings(next);
    setJson(SETTINGS_KEY, next);
  }, []);
  const setDiff = useCallback(
    (patch: Partial<DiffSettings>) => save({ ...settings, diff: { ...settings.diff, ...patch } }),
    [settings, save],
  );
  const resetDiff = useCallback(() => save({ ...settings, diff: DEFAULTS.diff }), [settings, save]);
  const setAppearance = useCallback(
    (patch: Partial<AppearanceSettings>) => save({ ...settings, appearance: { ...settings.appearance, ...patch } }),
    [settings, save],
  );
  const resetAppearance = useCallback(() => save({ ...settings, appearance: DEFAULTS.appearance }), [settings, save]);
  const setUpdates = useCallback(
    (patch: Partial<UpdateSettings>) => save({ ...settings, updates: { ...settings.updates, ...patch } }),
    [settings, save],
  );
  const setFlags = useCallback(
    (patch: Partial<FlagSettings>) => save({ ...settings, flags: { ...settings.flags, ...patch } }),
    [settings, save],
  );

  // Applied again when macOS switches between light and dark, for the System setting.
  const [systemIsDark, setSystemIsDark] = useState(systemDark.matches);
  useEffect(() => {
    const onChange = () => setSystemIsDark(systemDark.matches);
    systemDark.addEventListener("change", onChange);
    return () => systemDark.removeEventListener("change", onChange);
  }, []);
  useEffect(() => applyAppearance(settings.appearance), [settings.appearance, systemIsDark]);

  const theme = resolveTheme(settings.appearance.theme);
  return (
    <SettingsContext.Provider
      value={{ settings, theme, setDiff, resetDiff, setAppearance, resetAppearance, setUpdates, setFlags }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error("useSettings needs a SettingsProvider");
  return settings;
}
