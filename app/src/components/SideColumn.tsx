// The column on the right of every screen (beside the diff, or the map). Its width comes from --side-w in
// index.css, so it sits in the same place on all three screens and nothing jumps when switching.
export function SideColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <aside aria-label={label} className="flex w-(--side-w) shrink-0 flex-col gap-3 overflow-y-auto">
      {children}
    </aside>
  );
}
