import { InfoButton } from "@/components/InfoButton";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

// The fixed rules behind the Flags lens, in the words the map shows. They match
// src-tauri/src/data/snapshot/flags.rs; keep the two in step.
const FLAG_RULES: { flag: string; when: string }[] = [
  {
    flag: "possible secret",
    when: "An added line looks like a key or password: AWS keys, private keys, sk-… API keys, GitHub or Slack tokens, or api_key / secret / token / password set to a long quoted value. The matched text is never shown.",
  },
  {
    flag: "possible secret (.env file)",
    when: "A .env file changed (.env.example, .sample and .template don't count).",
  },
  {
    flag: "tests weakened (−n cases)",
    when: "A test file lost more test cases (it(…), test(…), def test_) than it gained.",
  },
  {
    flag: "tests skipped",
    when: "A test file gained a skip or only: .skip(…), .only(…), xit, xdescribe, @pytest.mark.skip, @unittest.skip.",
  },
  { flag: "test deleted", when: "A test file was deleted." },
  {
    flag: "debug leftovers (n)",
    when: "Added lines with debugger, breakpoint(), pdb.set_trace(), TODO or FIXME, or console.log outside scripts/, bin/, tools/ and cli/ folders.",
  },
  {
    flag: "dependency file",
    when: "A dependency list or lockfile changed: package.json, lockfiles, requirements*.txt, pyproject.toml, Cargo, go.mod and similar.",
  },
  { flag: "infra file", when: "Build or deploy setup changed: Dockerfile, docker-compose, .github/, Makefile." },
  {
    flag: "not connected",
    when: "A changed code file that neither uses nor is used by any other changed file.",
  },
];

// An ⓘ that opens the list of rules.
export function FlagRules({ label = "What gets flagged?" }: { label?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <InfoButton className="shrink-0 align-[-3px]" aria-label={label} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] gap-3">
        <PopoverHeader>
          <PopoverTitle>Rules that flag a file</PopoverTitle>
          <PopoverDescription>
            Fixed patterns read from the change itself, no AI. A flag points at something worth a look, not a verdict.
          </PopoverDescription>
        </PopoverHeader>
        <dl className="flex max-h-[min(420px,60vh)] flex-col gap-2.5 overflow-y-auto text-xs">
          {FLAG_RULES.map(({ flag, when }) => (
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
