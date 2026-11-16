import { Fragment } from "react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { keyParts, SHORTCUT_ROWS } from "@/lib/keys";
import { SectionHead } from "./SectionHead";
import { Eyebrow } from "@/components/Eyebrow";

// Settings → Keyboard: every shortcut by screen, read from lib/keys.ts (the same list the screens use). ? opens it.
export function KeyboardSettings() {
  return (
    <>
      <SectionHead title="Keyboard" text="Hold ⌘ to see each button's key next to it. Letter keys work when you aren't typing in a field." />
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        {SHORTCUT_ROWS.map(({ scope, rows }) => (
          <section key={scope} aria-label={scope} className="flex flex-col">
            <Eyebrow as="h3" className="pb-1.5">
              {scope}
            </Eyebrow>
            {rows.map((r) => (
              <div key={r.does} className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0">
                <span className="text-sm">
                  {r.does}
                  {r.note && <span className="text-faint"> · {r.note}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {r.ids.map((id, k) => (
                    <Fragment key={id}>
                      {k > 0 && <span className="text-xs text-faint">/</span>}
                      <KbdGroup>
                        {keyParts(id).map((p) => (
                          <Kbd key={p}>{p}</Kbd>
                        ))}
                      </KbdGroup>
                    </Fragment>
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
