import { CircleArrowUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdates } from "@/lib/updates";

// "Restart to update" once a new version is installed in the background; nothing otherwise.
export function UpdateNote() {
  const { state, restart } = useUpdates();
  if (state.phase !== "ready") return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={restart}
      className="text-selection"
      title={`Version ${state.version} is installed. Restart to use it`}
    >
      <CircleArrowUpIcon data-icon="inline-start" />
      Restart to update
    </Button>
  );
}
