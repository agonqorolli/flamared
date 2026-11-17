import { Button } from "@/components/ui/button";
import { plural } from "@/lib/format";
import { shortDate, useLicense } from "@/lib/license";

// "9 days left in trial" during the trial, opening Settings → License; nothing once licensed.
export function TrialNote({ onOpen }: { onOpen: () => void }) {
  const { status } = useLicense();
  if (status.state !== "trial") return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onOpen}
      className="text-faint"
      title={`The trial ends ${shortDate(status.ends)}. Enter a license key`}
    >
      {plural(status.days_left, "day")} left in trial
    </Button>
  );
}
