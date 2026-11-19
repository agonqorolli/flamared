// The fixed rules that flag a file, in the words the Map shows, and which of them are on. They match
// src-tauri/src/data/snapshot/flags.rs; keep the two in step. Rules turned off in Settings → Flags still run on the
// Rust side; the window just doesn't show what they find.

export type FlagRuleId =
  "secret" | "env" | "weakened" | "skipped" | "deleted" | "debug" | "deps" | "infra" | "connected";

interface FlagRule {
  id: FlagRuleId;
  flag: string; // as the Map shows it; "n" stands for a number
  match: (flag: string) => boolean; // is this flag (as the Rust side writes it) one of the rule's?
  when: string;
}

const exactly = (text: string) => (flag: string) => flag === text;
const startingWith = (text: string) => (flag: string) => flag.startsWith(text);

export const FLAG_RULES: FlagRule[] = [
  {
    id: "secret",
    flag: "possible secret",
    match: exactly("possible secret"),
    when: "An added line looks like a key or password: AWS keys, private keys, sk-… API keys, GitHub or Slack tokens, or api_key / secret / token / password set to a long quoted value. The matched text is never shown.",
  },
  {
    id: "env",
    flag: "possible secret (.env file)",
    match: exactly("possible secret (.env file)"),
    when: "A .env file changed (.env.example, .sample and .template don't count).",
  },
  {
    id: "weakened",
    flag: "tests weakened (−n cases)",
    match: startingWith("tests weakened"),
    when: "A test file lost more test cases (it(…), test(…), def test_) than it gained.",
  },
  {
    id: "skipped",
    flag: "tests skipped",
    match: exactly("tests skipped"),
    when: "A test file gained a skip or only: .skip(…), .only(…), xit, xdescribe, @pytest.mark.skip, @unittest.skip.",
  },
  { id: "deleted", flag: "test deleted", match: exactly("test deleted"), when: "A test file was deleted." },
  {
    id: "debug",
    flag: "debug leftovers (n)",
    match: startingWith("debug leftovers"),
    when: "Added lines with debugger, breakpoint(), pdb.set_trace(), TODO or FIXME, or console.log outside scripts/, bin/, tools/ and cli/ folders.",
  },
  {
    id: "deps",
    flag: "dependency file",
    match: exactly("dependency file"),
    when: "A dependency list or lockfile changed: package.json, lockfiles, requirements*.txt, pyproject.toml, Cargo, go.mod and similar.",
  },
  {
    id: "infra",
    flag: "infra file",
    match: exactly("infra file"),
    when: "Build or deploy setup changed: Dockerfile, docker-compose, .github/, Makefile.",
  },
  {
    id: "connected",
    flag: "not connected",
    match: exactly("not connected"),
    when: "A changed code file that neither uses nor is used by any other changed file. Also the note under such a file in Changes.",
  },
];

// A file's flags without the ones whose rule is turned off. A flag no rule knows (a newer Rust side) stays.
export function flagsOn(flags: string[], off: FlagRuleId[]): string[] {
  return flags.filter((flag) => {
    const rule = FLAG_RULES.find((rule) => rule.match(flag));
    return !rule || !off.includes(rule.id);
  });
}
