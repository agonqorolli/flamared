// The three screens: their names, icons and keys, for the header's tabs and for the buttons that jump to a file
// on another screen.
import { ClockIcon, FileDiffIcon, MapIcon } from "lucide-react";
import type { KeyId } from "./keys";

export type View = "changes" | "timeline" | "map";

interface ViewInfo {
  id: View;
  name: string;
  icon: typeof ClockIcon;
  goKey: KeyId; // switches to the screen
  jumpKey: KeyId; // shows the selected file on it
}

export const VIEWS: ViewInfo[] = [
  { id: "changes", name: "Changes", icon: FileDiffIcon, goKey: "goChanges", jumpKey: "toChanges" },
  { id: "timeline", name: "Timeline", icon: ClockIcon, goKey: "goTimeline", jumpKey: "toTimeline" },
  { id: "map", name: "Map", icon: MapIcon, goKey: "goMap", jumpKey: "toMap" },
];

export function viewInfo(id: View): ViewInfo {
  return VIEWS.find((view) => view.id === id) ?? VIEWS[0];
}
