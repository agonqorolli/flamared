import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { FLAG_RULES, type FlagRuleId } from "@/lib/flags";
import { useSettings } from "@/lib/settings";
import { SectionHead } from "./SectionHead";
import { ResetButton, SettingRow, SettingsBody } from "./SettingRow";

// Rules whose flags are a safety net: turning one off says what is lost.
const SAFETY: Partial<Record<FlagRuleId, string>> = {
  secret: "Off: keys and passwords an agent adds won't be pointed out.",
  env: "Off: changed .env files won't be pointed out.",
};

// Settings → Flags: each rule that flags a file, to turn off when it is noise for you.
export function FlagSettings() {
  const { settings, setFlags } = useSettings();
  const off = settings.flags.off;
  const turn = (id: FlagRuleId, on: boolean) =>
    setFlags({ off: on ? off.filter((rule) => rule !== id) : [...off, id] });
  return (
    <>
      <SectionHead
        title="Flags"
        text="Fixed rules, no AI, that point at something worth a look on the Map. Turn off the ones that are noise for you."
      />
      <SettingsBody>
        <FieldGroup>
          {FLAG_RULES.map(({ id, flag, when }) => (
            <SettingRow
              key={id}
              label={flag}
              htmlFor={`flag-${id}`}
              description={
                <>
                  {when}
                  {off.includes(id) && SAFETY[id] && <span className="block text-warn">{SAFETY[id]}</span>}
                </>
              }
            >
              <Switch id={`flag-${id}`} checked={!off.includes(id)} onCheckedChange={(on) => turn(id, on)} />
            </SettingRow>
          ))}
          <FieldSeparator />
          <SettingRow label="Defaults" description="Every rule on.">
            <ResetButton onClick={() => setFlags({ off: [] })} />
          </SettingRow>
        </FieldGroup>
      </SettingsBody>
    </>
  );
}
