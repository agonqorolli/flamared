import { Fragment } from "react";
import { Eyebrow } from "@/components/Eyebrow";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { keyParts, SHORTCUT_ROWS } from "@/lib/keys";
import { SectionHead } from "./SectionHead";
import { SettingsBody } from "./SettingRow";

// Settings → Keyboard: every shortcut by screen, read from lib/keys.ts (the same list the screens use). ? opens it.
export function KeyboardSettings() {
  return (
    <>
      <SectionHead
        title="Keyboard"
        text="Hold ⌘ to see each button's key next to it. Letter keys work when you aren't typing in a field."
      />
      <SettingsBody className="flex flex-col gap-6">
        {SHORTCUT_ROWS.map(({ scope, rows }) => (
          <section key={scope} aria-label={scope} className="flex flex-col">
            <Eyebrow as="h3" className="pb-1.5">
              {scope}
            </Eyebrow>
            {rows.map((row) => (
              <div key={row.does} className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0">
                <span className="text-sm">
                  {row.does}
                  {row.note && <span className="text-faint"> · {row.note}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {row.ids.map((id, position) => (
                    <Fragment key={id}>
                      {position > 0 && <span className="text-xs text-faint">/</span>}
                      <KbdGroup>
                        {keyParts(id).map((part) => (
                          <Kbd key={part}>{part}</Kbd>
                        ))}
                      </KbdGroup>
                    </Fragment>
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
      </SettingsBody>
    </>
  );
}
