// What the loading screen teaches while a repo or branch opens: one thing the app can do per hint.
import { inTauri } from "@/lib/api";
import { getJson, setJson } from "@/lib/store";

export interface Hint {
  title: string;
  text: string;
  seconds: number; // how long it takes to read: 1 to notice it, plus 1 per 4 words, rounded up; 5 at most
  desktopOnly?: boolean; // needs the Rust side (Live, folders)
}

const ALL_HINTS: Hint[] = [
  {
    title: "Every shortcut",
    text: "Press ? to see every key, screen by screen.",
    seconds: 4,
  },
  {
    title: "Mark as you read",
    text: "G marks a file Looks good, W marks Needs work.",
    seconds: 5,
  },
  {
    title: "Fit more on screen",
    text: "Compact density in Settings fits more rows.",
    seconds: 4,
  },
  {
    title: "See every key",
    text: "Hold ⌘ to see each button's shortcut.",
    seconds: 4,
  },
  {
    title: "The agent's words",
    text: "Press A to show the agent's messages in the list.",
    seconds: 5,
  },
  {
    title: "No mouse needed",
    text: "K and J step to the next and previous file.",
    seconds: 5,
  },
  {
    title: "Side by side",
    text: "Press S to show the diff side by side.",
    seconds: 4,
  },
  {
    title: "Grouped by imports",
    text: "Files that use each other are grouped together.",
    seconds: 4,
  },
  {
    title: "How it happened",
    text: "Timeline lists every edit under the prompt behind it.",
    seconds: 4,
  },
  {
    title: "Still in final",
    text: "On the Map, 3 shows how much agent code is still there.",
    seconds: 5,
  },
  {
    title: "Was it tested?",
    text: "On the Map, 4 shows if tests passed after the last edit.",
    seconds: 5,
  },
  {
    title: "Left to review",
    text: "On the Map, 5 shows which files you've marked.",
    seconds: 4,
  },
  {
    title: "Rework",
    text: "On the Map, 2 shows the files the agent edited most.",
    seconds: 4,
  },
  {
    title: "Jump between screens",
    text: "C, T and M show the file in Changes, Timeline or Map.",
    seconds: 5,
  },
  {
    title: "Any branch",
    text: "Pick a branch to view it without checking it out.",
    seconds: 4,
  },
  {
    title: "Pause when busy",
    text: "Press L to switch between Live and Paused.",
    seconds: 4,
    desktopOnly: true,
  },
  {
    title: "Make room",
    text: "Drag a pane's edge to resize it. Double-click resets.",
    seconds: 4,
  },
  {
    title: "Your colors",
    text: "Settings → Diff style has a dozen color themes.",
    seconds: 4,
  },
  {
    title: "Stays on your machine",
    text: "Your code and sessions never leave this machine.",
    seconds: 4,
  },
  {
    title: "Spot what's new",
    text: "A dot marks what changed since you last looked.",
    seconds: 4,
  },
  {
    title: "Watch for flags",
    text: "On the Map, 6 marks risky changes, like secrets.",
    seconds: 4,
  },
  {
    title: "Size at a glance",
    text: "On the Map, 1 shows how many lines each file changed.",
    seconds: 5,
  },
  {
    title: "Zoom into a folder",
    text: "On the Map, click a folder's name. Esc steps back.",
    seconds: 5,
  },
  {
    title: "Was it kept?",
    text: "Timeline tags each edit kept, rewritten or gone.",
    seconds: 4,
  },
  {
    title: "Did it run the tests?",
    text: "Timeline shows the tests, lint and builds the agent ran.",
    seconds: 5,
  },
  {
    title: "Checked after the edit",
    text: "Each edit in Timeline lists the checks that ran after it.",
    seconds: 5,
  },
  {
    title: "Outside the diff",
    text: "Timeline shows commands that deleted files or touched a database.",
    seconds: 5,
  },
  {
    title: "Commits too",
    text: "Timeline shows your commits between the agent's turns.",
    seconds: 4,
  },
  {
    title: "Read in order",
    text: "Each group lists its files in the order to read them.",
    seconds: 5,
  },
  {
    title: "Only what's new",
    text: "If a marked file changes, a bar marks the new lines.",
    seconds: 5,
  },
  {
    title: "Used by many",
    text: "Files many others use are kept apart. Change with care.",
    seconds: 5,
  },
  {
    title: "What sections mean",
    text: "The ⓘ beside each section explains what's in it.",
    seconds: 4,
  },
  {
    title: "Not just code",
    text: "Docs, config and untracked files are listed too.",
    seconds: 4,
  },
  {
    title: "Light, dark or gray",
    text: "Pick a theme in Settings, or follow macOS.",
    seconds: 4,
  },
  {
    title: "Reload anytime",
    text: "⌘R reads the repo again, even while Paused.",
    seconds: 4,
  },
  {
    title: "Any folder",
    text: "⌘O opens any folder, not just your agents' repos.",
    seconds: 4,
    desktopOnly: true,
  },
  {
    title: "Branches at a glance",
    text: "The branch picker counts each branch's changed files.",
    seconds: 4,
  },
  {
    title: "Read it all",
    text: "Click a long agent message to read all of it.",
    seconds: 5,
  },
  {
    title: "What a file touches",
    text: "The side column shows what a file uses and what uses it.",
    seconds: 5,
  },
  {
    title: "Marks are yours",
    text: "Review marks are notes to you. Nothing touches the repo.",
    seconds: 5,
  },
  {
    title: "Read-only",
    text: "The app only reads. It never changes your files.",
    seconds: 4,
  },
  {
    title: "No setup",
    text: "Works with Claude Code and Codex. Nothing to install.",
    seconds: 4,
  },
];

export const HINTS = ALL_HINTS.filter((hint) => inTauri || !hint.desktopOnly);

const DECK_KEY = "loading-hints";

// The hints in a random order (Fisher–Yates).
function shuffled(): number[] {
  const order = HINTS.map((_, index) => index);
  for (let at = order.length - 1; at > 0; at--) {
    const other = Math.floor(Math.random() * (at + 1));
    [order[at], order[other]] = [order[other], order[at]];
  }
  return order;
}

// The next hint to show, at random: hints are dealt from a shuffled deck that is kept between launches, so every
// hint comes up once before any comes up again. A new deck never starts with the hint just shown.
export function nextHint(): number {
  const saved = getJson<number[]>(DECK_KEY, []);
  let deck = Array.isArray(saved) ? saved.filter((index) => Number.isInteger(index) && index < HINTS.length) : [];
  if (!deck.length) {
    const last = getJson<number | null>(`${DECK_KEY}-last`, null);
    deck = shuffled();
    if (deck[0] === last) deck.push(deck.shift() ?? 0);
  }
  const [hint, ...rest] = deck;
  setJson(DECK_KEY, rest);
  setJson(`${DECK_KEY}-last`, hint);
  return hint;
}
