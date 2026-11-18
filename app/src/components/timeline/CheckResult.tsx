import { CheckIcon, XIcon } from "lucide-react";
import type { CheckRun } from "@/lib/timeline";
import type { Check } from "@/lib/types";

const CHECK_LABEL: Record<Check, string> = { test: "tests", types: "types", lint: "lint", build: "build" };

// What a command checked, in the order it ran them: "Lint + types".
function checkLabel(checks: Check[]) {
  const label = checks.map((check) => CHECK_LABEL[check]).join(" + ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// For a check's hover text: the whole command, what the agent said it was for, and how it went.
export function checkTitle(run: CheckRun) {
  const result = run.failed ? "Failed" : "Passed";
  return `${result}: ${run.cmd}${run.desc ? `\n${run.desc}` : ""}`;
}

// A check the agent ran: a green check or a red cross where an edit's status letter sits, what kind of check, and
// how many tests passed when the output says so.
export function CheckResult({ run }: { run: CheckRun }) {
  const Icon = run.failed ? XIcon : CheckIcon;
  return (
    <>
      <span className="grid w-3 shrink-0 place-items-center">
        <Icon
          className={run.failed ? "size-3 text-rem" : "size-3 text-add"}
          aria-label={run.failed ? "Failed" : "Passed"}
        />
      </span>
      <span className="shrink-0 font-medium">{checkLabel(run.checks)}</span>
      {run.failed && <span className="shrink-0 text-rem">failed</span>}
      {!run.failed && run.passed !== null && <span className="shrink-0 text-faint">{run.passed} passed</span>}
    </>
  );
}
