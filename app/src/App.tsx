import { FolderPlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_NAME } from "@/brand";
import { BranchEmpty } from "@/components/BranchEmpty";
import { Header } from "@/components/header/Header";
import { KeyHint } from "@/components/KeyHint";
import { TrialEnded } from "@/components/license/TrialEnded";
import { LoadingHints } from "@/components/loading/LoadingHints";
import { LogoLoader } from "@/components/loading/LogoLoader";
import { useLoadingScreen } from "@/components/loading/useLoadingScreen";
import { type Focus, Screens } from "@/components/Screens";
import { SettingsDialog, type SettingsSection } from "@/components/settings/SettingsDialog";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { TooltipProvider } from "@/components/ui/tooltip";
import { canPickFolder, pickRepoFolder } from "@/lib/api";
import { useKeyHints, useKeys } from "@/lib/keys";
import { LicenseProvider, useLicense } from "@/lib/license";
import { useLiveRepo } from "@/lib/live";
import { SettingsProvider, useSettings } from "@/lib/settings";
import type { LicenseStatus } from "@/lib/types";
import { UpdatesProvider } from "@/lib/updates";
import { cn } from "@/lib/utils";
import type { View } from "@/lib/views";

// The license decides what the window shows: the app, or the trial-ended screen (the app isn't even started then).
export default function App({ license }: { license: LicenseStatus }) {
  return (
    <SettingsProvider>
      <UpdatesProvider>
        <LicenseProvider initial={license}>
          <TooltipProvider delayDuration={200}>
            <Gate />
          </TooltipProvider>
        </LicenseProvider>
      </UpdatesProvider>
    </SettingsProvider>
  );
}

function Gate() {
  return useLicense().status.state === "ended" ? <TrialEnded /> : <Workspace />;
}

// The app itself: the header, and under it the open repo's screens, or what stands in for them while there is
// nothing to show.
function Workspace() {
  const {
    snap,
    loading,
    opening,
    updating,
    error,
    retry,
    dismissError,
    live,
    setLive,
    pending,
    fresh,
    seen,
    open,
    viewBranch,
    refresh,
    liveAvailable,
  } = useLiveRepo();
  const [view, setView] = useState<View>("changes");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsAt, setSettingsAt] = useState<SettingsSection | undefined>();
  const openSettings = (at?: SettingsSection) => {
    setSettingsAt(at);
    setSettingsOpen(true);
  };
  const [notice, setNotice] = useState<string | null>(null); // a short problem that doesn't replace the screen
  const openFolder = async () => {
    try {
      const root = await pickRepoFolder();
      if (!root) return;
      setNotice(null);
      open(root);
    } catch (e) {
      setNotice(String(e));
    }
  };
  const [focus, setFocus] = useState<Focus | null>(null);
  const jump = (to: View) => (path: string) => {
    setView(to);
    setFocus((last) => ({ view: to, path, n: (last?.n ?? 0) + 1 }));
  };

  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  // Shortcuts that work on every screen (lib/keys.ts lists them all; each screen handles its own).
  const { settings, setDiff } = useSettings();
  const toggleSplitDiff = () => setDiff({ layout: settings.diff.layout === "split" ? "unified" : "split" });
  useKeyHints();
  useKeys(true, {
    goChanges: () => setView("changes"),
    goTimeline: () => setView("timeline"),
    goMap: () => setView("map"),
    reload: !loading && refresh,
    settings: () => openSettings(),
    shortcuts: () => openSettings("keyboard"),
    openFolder: canPickFolder && openFolder,
    live: liveAvailable && (() => setLive(!live)),
    splitDiff: !opening && view !== "map" && toggleSplitDiff,
  });

  const hasChanges = !!snap && Object.keys(snap.diffs).length > 0;
  // While a repo or branch opens, the loading screen takes the screens' place, and stays until its first hint has
  // been read; a failed load shows its error right away.
  const loadingScreen = useLoadingScreen(opening);
  const loadingShown = !error && (!!opening || !!loadingScreen);
  return (
    <div className="flex h-full flex-col">
      <Header
        snap={snap}
        view={view}
        loading={loading}
        opening={opening}
        live={liveAvailable ? { on: live, updating, pending, set: setLive } : null}
        onView={setView}
        onOpenRepo={open}
        onOpenFolder={openFolder}
        onViewBranch={viewBranch}
        onRefresh={refresh}
        onSettings={openSettings}
      />
      <SettingsDialog open={settingsOpen} start={settingsAt} onOpenChange={setSettingsOpen} />
      {notice && <Notice text={notice} onDismiss={() => setNotice(null)} />}
      {error && snap && <Notice text={error} onRetry={retry} onDismiss={dismissError} />}
      <div aria-busy={!!opening} className="flex min-h-0 flex-1 flex-col">
        {loadingShown && loadingScreen && <LoadingHints screen={loadingScreen} />}
        {!loadingShown && !snap && error && <CouldNotRead error={error} onRetry={retry} onOpenFolder={openFolder} />}
        {!loadingShown && !snap && !error && <NoRepo loading={loading} onAgents={() => openSettings("agents")} />}
        {!loadingShown && snap && !hasChanges && <BranchEmpty branch={snap.viewing.branch} />}
        {!loadingShown && snap && hasChanges && (
          <Screens snap={snap} view={view} active focus={focus} fresh={fresh} onSeen={seen} onJump={jump} />
        )}
      </div>
    </div>
  );
}

interface NoticeProps {
  text: string;
  onRetry?: () => void;
  onDismiss: () => void;
}

// A problem that doesn't replace the screen: a red bar under the header, to dismiss or, when it can be, to retry.
function Notice({ text, onRetry, onDismiss }: NoticeProps) {
  return (
    <Alert variant="destructive" className={cn("mx-3 mt-3 w-auto", onRetry && "pr-32")}>
      <AlertDescription>{text}</AlertDescription>
      <AlertAction className={onRetry ? "flex gap-1" : undefined}>
        {onRetry && (
          <Button variant="ghost" size="xs" onClick={onRetry}>
            Retry
          </Button>
        )}
        <Button variant="ghost" size="xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertAction>
    </Alert>
  );
}

interface CouldNotReadProps {
  error: string;
  onRetry: () => void;
  onOpenFolder: () => void;
}

// In place of the screens when the first repo couldn't be read. The header has no repo picker yet, so the way to
// another repo is here.
function CouldNotRead({ error, onRetry, onOpenFolder }: CouldNotReadProps) {
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyTitle>Couldn't read this repository</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
        {canPickFolder && (
          <Button onClick={onOpenFolder}>
            <FolderPlusIcon data-icon="inline-start" />
            Open folder…
            <KeyHint id="openFolder" />
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
}

interface NoRepoProps {
  loading: boolean;
  onAgents: () => void;
}

// In place of the screens before a repo is open: the animated logo while the first one loads, or that there is none,
// with the way to point the app at agents that keep their sessions somewhere else.
function NoRepo({ loading, onAgents }: NoRepoProps) {
  if (loading) {
    return (
      <Empty className="flex-1">
        <LogoLoader label="Loading" />
      </Empty>
    );
  }
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyTitle>No repository yet</EmptyTitle>
        <EmptyDescription>
          No coding agent session was found on this machine. Opening any folder comes with the folder picker.
        </EmptyDescription>
      </EmptyHeader>
      {canPickFolder && (
        <EmptyContent>
          <Button variant="outline" onClick={onAgents}>
            Agent folders…
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
