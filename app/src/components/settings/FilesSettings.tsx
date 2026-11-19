import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Eyebrow } from "@/components/Eyebrow";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { inTauri, leftOutPatterns, setLeftOutPatterns } from "@/lib/api";
import { SectionHead } from "./SectionHead";
import { SettingsBody } from "./SettingRow";

// Ready-made sets of patterns for files people usually don't review line by line. None is on until added.
const PRESETS: { label: string; patterns: string[] }[] = [
  {
    label: "Lockfiles",
    patterns: [
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "bun.lock",
      "bun.lockb",
      "Cargo.lock",
      "poetry.lock",
      "uv.lock",
      "Pipfile.lock",
      "Gemfile.lock",
      "composer.lock",
      "go.sum",
    ],
  },
  { label: "Test snapshots", patterns: ["__snapshots__/", "*.snap"] },
  { label: "Minified files", patterns: ["*.min.js", "*.min.css"] },
  { label: "Source maps", patterns: ["*.js.map", "*.css.map"] },
];

// How patterns match, with an example of each kind.
const EXAMPLES: { pattern: string; means: string }[] = [
  { pattern: "*.lock", means: "files whose name ends in .lock, in any folder" },
  { pattern: "generated/", means: "everything in folders named generated, at any depth" },
  { pattern: "src/api/gen/**", means: "a slash ties it to the repository's top folder" },
  { pattern: "**/fixtures/*.json", means: "** stands for any number of folders" },
];

// What a pattern matches, in a few words, by its kind (the same rules as left_out.rs).
function kindOf(pattern: string) {
  const body = pattern.replace(/\/$/, "");
  if (body.includes("/")) return "From the repository's top";
  if (pattern.endsWith("/")) return "Folders with this name, anywhere";
  return "Files or folders with this name, anywhere";
}

// Settings → Files: patterns of committed files to leave out of the review, with ready-made sets to add.
export function FilesSettings() {
  const [patterns, setPatterns] = useState<string[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (inTauri) leftOutPatterns().then(setPatterns, (e) => console.warn("Couldn't read the patterns:", e));
  }, []);

  // Saves the new list; the open repository reloads without the files it leaves out.
  const save = async (next: string[]) => {
    try {
      setPatterns(await setLeftOutPatterns(next));
      setError(null);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  };
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!patterns || !draft.trim()) return;
    if (await save([...patterns, draft])) setDraft("");
  };

  return (
    <>
      <SectionHead
        title="Files to leave out"
        text="Committed files you'd rather not review one by one, like lockfiles or generated code. They're still counted and checked for flags, folded at the end of Changes."
      />
      <SettingsBody className="flex flex-col gap-6">
        {!patterns ? (
          <FieldDescription>
            {inTauri ? "Reading the patterns…" : "Patterns are kept in the app, not in this preview."}
          </FieldDescription>
        ) : (
          <>
            <section aria-label="Add common files" className="flex flex-col gap-2">
              <Eyebrow as="h3">Add common files</Eyebrow>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => {
                  const added = preset.patterns.every((pattern) => patterns.includes(pattern));
                  return (
                    <Button
                      key={preset.label}
                      variant="outline"
                      size="sm"
                      disabled={added}
                      title={preset.patterns.join("  ")}
                      onClick={() => save([...patterns, ...preset.patterns])}
                    >
                      {added ? <CheckIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
                      {preset.label}
                    </Button>
                  );
                })}
              </div>
            </section>

            <form onSubmit={add}>
              <Field data-invalid={!!error || undefined}>
                <FieldLabel htmlFor="left-out-pattern">Pattern</FieldLabel>
                <div className="flex gap-1.5">
                  <Input
                    id="left-out-pattern"
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setError(null);
                    }}
                    placeholder="*.lock, generated/, src/api/gen/**"
                    aria-invalid={!!error || undefined}
                    spellCheck={false}
                    autoComplete="off"
                    className="font-mono text-xs placeholder:font-sans"
                  />
                  <Button type="submit" variant="outline" disabled={!draft.trim()}>
                    Add
                  </Button>
                </div>
                {error && <FieldError>{error}</FieldError>}
              </Field>
            </form>

            <PatternList
              patterns={patterns}
              onRemove={(gone) => save(patterns.filter((pattern) => pattern !== gone))}
            />

            <section aria-label="How patterns match" className="flex flex-col gap-1.5">
              <Eyebrow as="h3">How patterns match</Eyebrow>
              {EXAMPLES.map(({ pattern, means }) => (
                <p key={pattern} className="text-xs text-muted-foreground">
                  <code className="font-mono text-foreground">{pattern}</code> {means}
                </p>
              ))}
              <p className="text-xs text-muted-foreground">
                The patterns apply to every repository. Files in .gitignore are never shown in the first place.
              </p>
            </section>
          </>
        )}
      </SettingsBody>
    </>
  );
}

interface ListProps {
  patterns: string[];
  onRemove: (pattern: string) => void;
}

// The patterns in use, each with what it matches and a button to remove it; or that nothing is left out.
function PatternList({ patterns, onRemove }: ListProps) {
  if (!patterns.length) {
    return <FieldDescription>Nothing is left out: every file that would be committed is shown.</FieldDescription>;
  }
  return (
    <section aria-label="Patterns in use" className="flex flex-col">
      <Eyebrow as="h3" className="pb-1.5">
        Left out · {patterns.length}
      </Eyebrow>
      {patterns.map((pattern) => (
        <div key={pattern} className="flex items-center justify-between gap-4 border-b py-1.5 last:border-b-0">
          <span className="min-w-0">
            <span className="block truncate font-mono text-xs">{pattern}</span>
            <span className="block text-mini text-faint">{kindOf(pattern)}</span>
          </span>
          <Button variant="ghost" size="icon-xs" aria-label={`Remove ${pattern}`} onClick={() => onRemove(pattern)}>
            <XIcon />
          </Button>
        </div>
      ))}
    </section>
  );
}
