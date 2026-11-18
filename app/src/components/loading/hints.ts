// What the loading screen teaches while a repo or branch opens: one thing the app can do per hint.
import { inTauri } from "@/lib/api";
import { getJson, setJson } from "@/lib/store";

export interface Hint {
  title: string;
  text: string;
  seconds: number; // how long it takes to read: about 4 words a second, plus one to notice it
  desktopOnly?: boolean; // needs the Rust side (Live, folders)
}

const ALL_HINTS: Hint[] = [
  {
    title: "Every shortcut in one place",
    text: "Press ? for the full list of keys, screen by screen.",
    seconds: 5,
  },
  {
    title: "Mark files as you read",
    text: "G marks a file Looks good, W Needs work. The mark clears when the agent edits the file again.",
    seconds: 7,
  },
  {
    title: "More on screen",
    text: "Compact density fits more rows in the window. Text stays the same size.",
    seconds: 5,
  },
  {
    title: "Hold ⌘ to see the keys",
    text: "Keep ⌘ pressed for a moment and each button shows its shortcut.",
    seconds: 6,
  },
  {
    title: "The agent's own words",
    text: "A shows the agent's messages in the list, next to the files they're about.",
    seconds: 6,
  },
  {
    title: "Read without the mouse",
    text: "J and K go to the next and previous file in Changes, or edit in Timeline.",
    seconds: 6,
  },
  {
    title: "Side by side",
    text: "S switches the diff between one column and side by side.",
    seconds: 4,
  },
  {
    title: "Files that work together",
    text: "Changes groups files by the imports between them, so each group is likely one piece of work.",
    seconds: 6,
  },
  {
    title: "See how it happened",
    text: "Timeline lists every edit in order, under the prompt that led to it.",
    seconds: 5,
  },
  {
    title: "What made it to the end",
    text: "On the Map, 3 colors each file by how much of what the agent wrote is still there.",
    seconds: 7,
  },
  {
    title: "Where the agent went back and forth",
    text: "On the Map, 2 colors each file by how often the agent edited it.",
    seconds: 6,
  },
  {
    title: "Same file, another screen",
    text: "From a file, C, T and M show it in Changes, Timeline or Map.",
    seconds: 6,
  },
  {
    title: "Look at any branch",
    text: "Picking a branch shows its changes without checking it out. The files on disk stay as they are.",
    seconds: 6,
  },
  {
    title: "Pause when it's busy",
    text: "L switches between Live and Paused. While paused, the header says what's waiting.",
    seconds: 5,
    desktopOnly: true,
  },
  {
    title: "Make room",
    text: "Drag the edge of the list or the side column to resize it. Double-click the edge to reset it.",
    seconds: 6,
  },
  {
    title: "Your colors",
    text: "Diff style has a dozen color themes, text sizes and line markers to choose from.",
    seconds: 5,
  },
  {
    title: "Stays on this machine",
    text: "Your code and the agents' sessions are read right here and never leave this machine.",
    seconds: 6,
  },
  {
    title: "Spot what's new",
    text: "A dot marks a file or edit that changed since you last selected it.",
    seconds: 5,
  },
  {
    title: "Watch for flags",
    text: "On the Map, 4 colors files that look risky: possible secrets, weakened or skipped tests, debug leftovers.",
    seconds: 6,
  },
  {
    title: "Size at a glance",
    text: "On the Map, 1 colors each file by how many lines changed.",
    seconds: 5,
  },
  {
    title: "Zoom into a folder",
    text: "On the Map, click a folder's name to zoom in. Esc steps back out.",
    seconds: 6,
  },
  {
    title: "Was the edit kept?",
    text: "In Timeline, each edit says whether it's still in the file, partly rewritten, or no longer there.",
    seconds: 6,
  },
  {
    title: "Commits in the story",
    text: "Your commits show up in Timeline between the agent's turns, in the order they happened.",
    seconds: 6,
  },
  {
    title: "Used by many",
    text: "Files used by 3 or more other changed files are kept apart. A change there can affect everything that uses them.",
    seconds: 7,
  },
  {
    title: "What the sections mean",
    text: "The ⓘ next to each section in the Changes list says what puts a file there.",
    seconds: 6,
  },
  {
    title: "Not just code",
    text: "Docs, config and new files not yet added to git are listed too, grouped by kind.",
    seconds: 6,
  },
  {
    title: "Light, dark or gray",
    text: "Appearance has Dark, Gray and Light, or System to follow macOS.",
    seconds: 5,
  },
  {
    title: "Reload anytime",
    text: "⌘R reads the repo again, even while Paused.",
    seconds: 4,
  },
  {
    title: "Any folder",
    text: "Repos come from your agents' sessions. ⌘O opens any other folder.",
    seconds: 4,
    desktopOnly: true,
  },
  {
    title: "Branches at a glance",
    text: "The branch picker shows how many files each branch changed since it split off.",
    seconds: 6,
  },
  {
    title: "Read the whole message",
    text: "Long agent messages show four lines. Click one to read it all.",
    seconds: 5,
  },
  {
    title: "What a file touches",
    text: "The side column lists what each changed file uses, and what uses it.",
    seconds: 5,
  },
  {
    title: "Marks are just for you",
    text: "Looks good and Needs work are notes to yourself. Nothing is written to the repo.",
    seconds: 6,
  },
  {
    title: "Read-only, always",
    text: "The app never changes your files or the agents' sessions. It only reads them.",
    seconds: 5,
  },
  {
    title: "No setup needed",
    text: "Claude Code and Codex sessions are read as they are, with no hooks or plugins to install.",
    seconds: 6,
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
