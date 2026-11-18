import { useEffect, useState } from "react";
import { APP_NAME } from "@/brand";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldGroup, FieldSeparator } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { agentFolders, inTauri, pickAgentFolder, resetAgentFolder, showInFinder } from "@/lib/api";
import { ago, plural } from "@/lib/format";
import type { AgentFolder, AgentId } from "@/lib/types";
import { SectionHead } from "./SectionHead";
import { SettingRow, SettingsBody } from "./SettingRow";

// What was found in an agent's folder: how many sessions and when the latest was written, or that there are none.
function found(folder: AgentFolder) {
  if (!folder.found) return `Not found. If ${folder.name} keeps its sessions somewhere else, pick that folder.`;
  if (folder.sessions === 0) return "No sessions yet.";
  return `${plural(folder.sessions, "session")}, the latest ${ago(folder.latest)}.`;
}

// Where the folder comes from, when it isn't the agent's own default.
function source(folder: AgentFolder) {
  if (folder.source === "variable") return ` (from ${folder.variable})`;
  if (folder.source === "chosen") return " (chosen here)";
  return "";
}

interface RowProps {
  folder: AgentFolder;
  error: string | null;
  busy: boolean;
  onChange: (agent: AgentId) => void;
  onReset: (agent: AgentId) => void;
}

// One agent: its folder and what is in it, with Show in Finder, Change… and, for a chosen folder, Use default.
function AgentRow({ folder, error, busy, onChange, onReset }: RowProps) {
  return (
    <SettingRow
      label={folder.name}
      description={
        <>
          <span className="block font-mono text-mini">
            {folder.folder}
            <span className="font-sans">{source(folder)}</span>
          </span>
          {found(folder)}
          {error && <span className="block text-destructive">{error}</span>}
        </>
      }
    >
      <div className="flex shrink-0 gap-1.5">
        {folder.found && (
          <Button variant="ghost" size="sm" onClick={() => showInFinder(folder.full)}>
            Show in Finder
          </Button>
        )}
        {folder.source === "chosen" && (
          <Button variant="outline" size="sm" onClick={() => onReset(folder.agent)} disabled={busy}>
            Use default
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => onChange(folder.agent)} disabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          Change…
        </Button>
      </div>
    </SettingRow>
  );
}

interface RowsProps {
  folders: AgentFolder[] | null; // null while they are read
  error: { agent: AgentId; text: string } | null;
  busy: AgentId | null;
  onChange: (agent: AgentId) => void;
  onReset: (agent: AgentId) => void;
}

// Every agent's row and the note under them; a spinner while they are read.
function AgentRows({ folders, error, busy, onChange, onReset }: RowsProps) {
  if (!inTauri) return <FieldDescription>Agent folders are read in the app, not in this preview.</FieldDescription>;
  if (!folders) return <Spinner aria-label="Looking for sessions" />;
  return (
    <FieldGroup>
      {folders.map((folder) => (
        <AgentRow
          key={folder.agent}
          folder={folder}
          error={error?.agent === folder.agent ? error.text : null}
          busy={busy === folder.agent}
          onChange={onChange}
          onReset={onReset}
        />
      ))}
      <FieldSeparator />
      <FieldDescription>
        Change a folder when an agent keeps its sessions somewhere else, such as a CLAUDE_CONFIG_DIR or CODEX_HOME set
        in your shell: apps opened from the Finder don't see those. The open repository reloads with the sessions from
        the new folder.
      </FieldDescription>
    </FieldGroup>
  );
}

// Settings → Agents: where each agent's sessions are read from, what was found there, and picking another folder.
export function AgentSettings() {
  const [folders, setFolders] = useState<AgentFolder[] | null>(null);
  const [busy, setBusy] = useState<AgentId | null>(null);
  const [error, setError] = useState<{ agent: AgentId; text: string } | null>(null);
  useEffect(() => {
    if (inTauri) agentFolders().then(setFolders, (e) => console.warn("Couldn't read the agents' folders:", e));
  }, []);

  // Runs a folder change for one agent; the list comes back with the new folder and what was found in it.
  const update = async (agent: AgentId, change: () => Promise<AgentFolder[] | null>) => {
    setBusy(agent);
    setError(null);
    try {
      const next = await change();
      if (next) setFolders(next);
    } catch (e) {
      setError({ agent, text: String(e) });
    } finally {
      setBusy(null);
    }
  };
  const onChange = (agent: AgentId) => {
    const name = folders?.find((folder) => folder.agent === agent)?.name ?? agent;
    update(agent, () => pickAgentFolder(agent, name));
  };
  const onReset = (agent: AgentId) => update(agent, () => resetAgentFolder(agent));

  return (
    <>
      <SectionHead
        title="Agents"
        text={`Where each agent's sessions are read from. ${APP_NAME} only reads them; it never changes them.`}
      />
      <SettingsBody>
        <AgentRows folders={folders} error={error} busy={busy} onChange={onChange} onReset={onReset} />
      </SettingsBody>
    </>
  );
}
