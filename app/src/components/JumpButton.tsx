import { KeyHint } from "@/components/KeyHint";
import { Button } from "@/components/ui/button";
import { hint } from "@/lib/keys";
import { type View, viewInfo } from "@/lib/views";

interface Props {
  to: View;
  verb?: "Show in" | "Open in";
  onClick: () => void;
}

// A small button on a file card that shows the same file on another screen: "Show in Timeline (T)".
export function JumpButton({ to, verb = "Show in", onClick }: Props) {
  const { name, icon: Icon, jumpKey } = viewInfo(to);
  const label = `${verb} ${name}`;
  return (
    <Button variant="outline" size="icon-xs" aria-label={label} title={`${label} (${hint(jumpKey)})`} onClick={onClick}>
      <Icon />
      <KeyHint id={jumpKey} />
    </Button>
  );
}
