import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { type AppearanceSettings as Appearance, useSettings } from "@/lib/settings";
import { SectionHead } from "./SectionHead";
import { Choice, ResetButton, SettingRow, SettingsBody } from "./SettingRow";

// Each theme's look in two swatches: the window and a card on it (theme colors shown as data). System is Gray and
// Light split corner to corner.
const THEMES: { id: Appearance["theme"]; label: string; window: string; card: string | null }[] = [
  { id: "dark", label: "Dark", window: "#0D0E11", card: "#1A1D23" },
  { id: "gray", label: "Gray", window: "#1E2024", card: "#2E3137" },
  { id: "light", label: "Light", window: "#FFFFFF", card: "#E6E9ED" },
  { id: "system", label: "System", window: "linear-gradient(135deg, #1E2024 50%, #FFFFFF 50%)", card: null },
];

const DENSITIES: { value: Appearance["density"]; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "spacious", label: "Spacious" },
];

// A theme's two colors as a small square, with the card in its corner.
function ThemeSwatch({ window, card }: { window: string; card: string | null }) {
  return (
    <span
      className="relative size-3.5 shrink-0 overflow-hidden rounded-[4px] border border-foreground/20"
      style={{ background: window }}
      aria-hidden
    >
      {card && <span className="absolute right-0 bottom-0 size-2 rounded-tl-[3px]" style={{ background: card }} />}
    </span>
  );
}

// Settings → Appearance: the theme and the density.
export function AppearanceSettings() {
  const { settings, setAppearance, resetAppearance } = useSettings();
  const { theme, density } = settings.appearance;
  const themes = THEMES.map(({ id, label, window, card }) => ({
    value: id,
    label: (
      <>
        <ThemeSwatch window={window} card={card} />
        {label}
      </>
    ),
  }));
  return (
    <>
      <SectionHead title="Appearance" text="How the app looks. Changes show right away." />
      <SettingsBody>
        <FieldGroup>
          <SettingRow
            label="Theme"
            description="Gray is the dark theme with softer contrast. System follows macOS: Gray when it's dark, Light when it's light. Diffs switch to a light code theme in Light."
          >
            <Choice value={theme} options={themes} onChange={(theme) => setAppearance({ theme })} />
          </SettingRow>
          <SettingRow label="Density" description="Space between rows and around panels. Text stays the same size.">
            <Choice value={density} options={DENSITIES} onChange={(density) => setAppearance({ density })} />
          </SettingRow>
          <FieldSeparator />
          <SettingRow label="Defaults" description="Gray theme, normal density.">
            <ResetButton onClick={resetAppearance} />
          </SettingRow>
        </FieldGroup>
      </SettingsBody>
    </>
  );
}
