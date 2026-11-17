import { InfoIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

// The fixed rules behind the Flags lens, in the words the map shows. They match src-tauri/src/data/snapshot.rs
// (`diff_flags` and the flags built in `build`); keep the two in step.
export const FLAG_RULES: [flag: string, when: string][] = [
  [
    "possible secret",
    "An added line looks like a key or password: AWS keys, private keys, sk-… API keys, GitHub or Slack tokens, or api_key / secret / token / password set to a long quoted value. The matched text is never shown.",
  ],
  ["possible secret (.env file)", "A .env file changed (.env.example, .sample and .template don't count)."],
  ["tests weakened (−n cases)", "A test file lost more test cases (it(…), test(…), def test_) than it gained."],
  [
    "tests skipped",
    "A test file gained a skip or only: .skip(…), .only(…), xit, xdescribe, @pytest.mark.skip, @unittest.skip.",
  ],
  ["test deleted", "A test file was deleted."],
  [
    "debug leftovers (n)",
    "Added lines with debugger, breakpoint(), pdb.set_trace(), TODO or FIXME, or console.log outside scripts/, bin/, tools/ and cli/ folders.",
  ],
  [
    "dependency file",
    "A dependency list or lockfile changed: package.json, lockfiles, requirements*.txt, pyproject.toml, Cargo, go.mod and similar.",
  ],
  ["infra file", "Build or deploy setup changed: Dockerfile, docker-compose, .github/, Makefile."],
  ["not connected", "A changed code file that neither uses nor is used by any other changed file."],
];

// An ⓘ that opens the list of rules.
export function FlagRules({ label = "What gets flagged?" }: { label?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full align-[-3px] text-faint hover:text-foreground"
          aria-label={label}
        >
          <InfoIcon className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] gap-3">
        <PopoverHeader>
          <PopoverTitle>Rules that flag a file</PopoverTitle>
          <PopoverDescription>
            Fixed patterns read from the change itself, no AI. A flag points at something worth a look, not a verdict.
          </PopoverDescription>
        </PopoverHeader>
        <dl className="flex max-h-[min(420px,60vh)] flex-col gap-2.5 overflow-y-auto text-xs">
          {FLAG_RULES.map(([flag, when]) => (
            <div key={flag} className="flex flex-col gap-0.5">
              <dt className="font-medium text-warn">{flag}</dt>
              <dd className="leading-snug text-muted-foreground">{when}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
