import { type ReactNode, useMemo, useState } from "react";
import { ChangesView } from "@/components/changes/ChangesView";
import { MapView } from "@/components/map/MapView";
import { TimelineView } from "@/components/timeline/TimelineView";
import type { Fresh } from "@/lib/live";
import { useReview } from "@/lib/review";
import { buildTimeline, type PromptOnMap } from "@/lib/timeline";
import type { Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { View } from "@/lib/views";

// A jump from one screen to a file on another; `n` makes a repeat jump to the same file count again.
export interface Focus {
  view: View;
  path: string;
  n: number;
}

interface Props {
  snap: Snapshot;
  view: View; // the screen being shown
  active: boolean; // false while another repo or branch is being opened: no screen listens to keys
  focus: Focus | null;
  fresh: Fresh;
  onSeen: (kind: keyof Fresh, key: string) => void;
  onJump: (to: View) => (path: string) => void;
  onView: (view: View) => void;
}

// Changes, Timeline and Map. All three stay mounted so each keeps its place; only the shown one listens to keys.
export function Screens({ snap, view, active, focus, fresh, onSeen, onJump, onView }: Props) {
  const timeline = useMemo(() => buildTimeline(snap), [snap]);
  // A prompt's files lit up on the Map, from its card in Timeline; cleared on the Map.
  const [prompt, setPrompt] = useState<PromptOnMap | null>(null);
  const showPromptOnMap = (shown: PromptOnMap) => {
    setPrompt(shown);
    onView("map");
  };
  const changed = useMemo(() => new Set(Object.keys(snap.diffs)), [snap]);
  const review = useReview(snap);
  const focusOn = (screen: View) => (focus?.view === screen ? focus : null);
  return (
    <>
      <Screen shown={view === "changes"}>
        <ChangesView
          snap={snap}
          review={review}
          active={active && view === "changes"}
          focus={focusOn("changes")}
          inTimeline={(path) => timeline.paths.has(path)}
          onShowInTimeline={onJump("timeline")}
          onShowInMap={onJump("map")}
          fresh={fresh.paths}
          onSeen={(path) => onSeen("paths", path)}
        />
      </Screen>
      <Screen shown={view === "timeline"}>
        <TimelineView
          timeline={timeline}
          active={active && view === "timeline"}
          focus={focusOn("timeline")}
          inChanges={(path) => changed.has(path)}
          onShowInChanges={onJump("changes")}
          onShowInMap={onJump("map")}
          onShowPromptOnMap={showPromptOnMap}
          fresh={fresh.edits}
          onSeen={(key) => onSeen("edits", key)}
        />
      </Screen>
      <Screen shown={view === "map"}>
        <MapView
          snap={snap}
          timeline={timeline}
          review={review}
          active={active && view === "map"}
          focus={focusOn("map")}
          prompt={prompt}
          onClearPrompt={() => setPrompt(null)}
          onOpenInChanges={onJump("changes")}
          onShowInTimeline={onJump("timeline")}
        />
      </Screen>
    </>
  );
}

function Screen({ shown, children }: { shown: boolean; children: ReactNode }) {
  return <div className={cn("flex min-h-0 min-w-0 flex-1", !shown && "hidden")}>{children}</div>;
}
