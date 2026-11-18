//! Where each agent keeps its session files. By default it is where the agent itself looks: Claude Code's
//! $CLAUDE_CONFIG_DIR, else ~/.claude; Codex's $CODEX_HOME, else ~/.codex. A folder chosen in Settings → Agents
//! replaces that (the app saves the choice in agents.rs and sets it here when it starts). An app opened from the
//! Finder doesn't see shell variables, so the choice is the dependable way to point the app elsewhere.
use crate::data::paths::{basename, dirname, home, join, tilde};
use crate::data::repos::{local_time, written_at};
use crate::data::snapshot::model::AgentFolder;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::RwLock;

/// An agent whose sessions the app reads.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Agent {
    Claude,
    Codex,
}

impl Agent {
    pub const ALL: [Agent; 2] = [Agent::Claude, Agent::Codex];

    pub fn name(self) -> &'static str {
        match self {
            Agent::Claude => "Claude Code",
            Agent::Codex => "Codex",
        }
    }

    /// The environment variable the agent reads its folder from.
    pub fn variable(self) -> &'static str {
        match self {
            Agent::Claude => "CLAUDE_CONFIG_DIR",
            Agent::Codex => "CODEX_HOME",
        }
    }

    /// Its folder's name in the home folder, when nothing says otherwise.
    fn home_folder(self) -> &'static str {
        match self {
            Agent::Claude => ".claude",
            Agent::Codex => ".codex",
        }
    }

    /// The folder inside its folder that holds the session files.
    fn sessions_folder(self) -> &'static str {
        match self {
            Agent::Claude => "projects",
            Agent::Codex => "sessions",
        }
    }
}

/// Folders chosen in Settings → Agents; None is the agent's own default.
#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
pub struct Chosen {
    pub claude: Option<String>,
    pub codex: Option<String>,
}

impl Chosen {
    fn of(&self, agent: Agent) -> Option<&str> {
        match agent {
            Agent::Claude => self.claude.as_deref(),
            Agent::Codex => self.codex.as_deref(),
        }
    }

    pub fn set(&mut self, agent: Agent, folder: Option<String>) {
        match agent {
            Agent::Claude => self.claude = folder,
            Agent::Codex => self.codex = folder,
        }
    }
}

static CHOSEN: RwLock<Chosen> = RwLock::new(Chosen {
    claude: None,
    codex: None,
});

pub fn chosen() -> Chosen {
    CHOSEN.read().unwrap().clone()
}

pub fn set_chosen(chosen: Chosen) {
    *CHOSEN.write().unwrap() = chosen;
}

/// Why an agent's folder is the one it is.
#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    /// ~/.claude or ~/.codex
    Default,
    /// the agent's environment variable
    Variable,
    /// picked in Settings → Agents
    Chosen,
}

/// The agent's folder: the chosen one, else its variable's, else the one in the home folder.
fn resolve(agent: Agent, chosen: Option<&str>, variable: Option<&str>, home: &str) -> (String, Source) {
    if let Some(folder) = chosen {
        return (folder.to_string(), Source::Chosen);
    }
    match variable.filter(|folder| !folder.is_empty()) {
        Some(folder) => (folder.to_string(), Source::Variable),
        None => (join(home, agent.home_folder()), Source::Default),
    }
}

fn folder_and_source(agent: Agent, chosen: Option<&str>) -> (String, Source) {
    let variable = std::env::var(agent.variable()).ok();
    resolve(agent, chosen, variable.as_deref(), &home())
}

/// The folder the agent keeps everything in (~/.claude, ~/.codex or the one chosen).
pub fn folder(agent: Agent) -> String {
    folder_and_source(agent, chosen().of(agent)).0
}

/// The folder inside it with the session files.
pub fn sessions_dir(agent: Agent) -> String {
    join(&folder(agent), agent.sessions_folder())
}

/// The agent's folder from a folder picked in Settings: the folder itself when the sessions folder is inside it,
/// or the one above when the sessions folder itself was picked; None when that is the default folder anyway.
/// A plain-language reason when it is neither.
pub fn from_picked(agent: Agent, picked: &str) -> Result<Option<String>, String> {
    let picked = picked.trim_end_matches('/');
    let inside = agent.sessions_folder();
    let folder = if Path::new(&join(picked, inside)).is_dir() {
        picked
    } else if basename(picked) == inside && Path::new(picked).is_dir() {
        dirname(picked)
    } else {
        return Err(format!(
            "{} has no {} sessions: there is no \"{inside}\" folder in it.",
            tilde(picked, &home()),
            agent.name()
        ));
    };
    let default = folder_and_source(agent, None).0;
    Ok((folder != default).then(|| folder.to_string()))
}

/// Each agent's folder, where it comes from, and the sessions found there, for Settings → Agents.
pub fn status() -> Vec<AgentFolder> {
    Agent::ALL.iter().map(|&agent| status_of(agent)).collect()
}

fn status_of(agent: Agent) -> AgentFolder {
    let (full, source) = folder_and_source(agent, chosen().of(agent));
    let files = super::files_of(agent);
    let latest = files.iter().map(|file| written_at(file)).fold(0.0, f64::max);
    AgentFolder {
        agent,
        name: agent.name(),
        folder: tilde(&full, &home()),
        found: Path::new(&join(&full, agent.sessions_folder())).is_dir(),
        full,
        source,
        variable: agent.variable(),
        sessions: files.len(),
        latest: local_time(latest),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chosen_then_variable_then_home() {
        let home = "/Users/me";
        assert_eq!(
            resolve(Agent::Claude, Some("/x"), Some("/y"), home),
            ("/x".into(), Source::Chosen)
        );
        assert_eq!(
            resolve(Agent::Claude, None, Some("/y"), home),
            ("/y".into(), Source::Variable)
        );
        assert_eq!(
            resolve(Agent::Claude, None, Some(""), home),
            ("/Users/me/.claude".into(), Source::Default)
        );
        assert_eq!(
            resolve(Agent::Codex, None, None, home),
            ("/Users/me/.codex".into(), Source::Default)
        );
    }

    #[test]
    fn picked_folder_or_its_sessions_folder() {
        let root = std::env::temp_dir().join(format!("flamared-folders-{}", std::process::id()));
        let claude = root.join("claude-work");
        std::fs::create_dir_all(claude.join("projects")).unwrap();
        let claude = claude.to_string_lossy().into_owned();

        assert_eq!(from_picked(Agent::Claude, &claude), Ok(Some(claude.clone())));
        assert_eq!(
            from_picked(Agent::Claude, &format!("{claude}/")),
            Ok(Some(claude.clone()))
        );
        assert_eq!(
            from_picked(Agent::Claude, &format!("{claude}/projects")),
            Ok(Some(claude.clone()))
        );
        // A Claude Code folder has no "sessions" folder, so it isn't a Codex folder.
        assert!(from_picked(Agent::Codex, &claude).is_err());
        std::fs::remove_dir_all(&root).unwrap();
    }
}
