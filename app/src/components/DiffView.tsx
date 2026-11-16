import { PatchDiff } from "@pierre/diffs/react";

// A diff in a card that scrolls inside itself; `empty` shows instead when there is no patch.
export function DiffView({ id, patch, more, empty }: { id: string; patch: string | null; more?: string | null; empty: string }) {
  if (!patch) {
    return <div className="flex h-24 shrink-0 items-center rounded-xl border bg-card px-6 text-sm text-faint">{empty}</div>;
  }
  return (
    <div className="min-h-0 shrink overflow-auto rounded-xl border bg-card">
      <PatchDiff key={id} patch={patch} options={{ theme: "pierre-dark", themeType: "dark", diffStyle: "unified", disableFileHeader: true, overflow: "scroll" }} />
      {more && <div className="border-t px-4 py-2 text-xs text-faint">{more}</div>}
    </div>
  );
}
