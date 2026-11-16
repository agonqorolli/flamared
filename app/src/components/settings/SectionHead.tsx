import { DialogHeader } from "@/components/ui/dialog";

// The heading of a settings section.
export function SectionHead({ title, text }: { title: string; text: string }) {
  return (
    <DialogHeader className="shrink-0 gap-0.5 border-b px-6 py-4 pr-14">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{text}</p>
    </DialogHeader>
  );
}
