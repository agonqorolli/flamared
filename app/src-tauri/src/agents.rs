//! Settings → Agents: where each agent's sessions are read from (data/sessions/folders.rs). A folder chosen there
//! is kept in agents.json in the app's data folder and set again each time the app starts. The agents' own files
//! are only read, never written.
use crate::app_data;
use crate::commands::blocking;
use crate::data::sessions::folders::{self, Agent, Chosen};
use crate::data::snapshot::model::AgentFolder;
use tauri::{AppHandle, Emitter};

const FILE: &str = "agents.json";

/// Use the folders chosen earlier; called once when the app starts, before the window asks for anything.
pub fn load(app: &AppHandle) {
    if let Some(chosen) = app_data::read::<Chosen>(app, FILE) {
        folders::set_chosen(chosen);
    }
}

/// Each agent's folder and the sessions found in it.
#[tauri::command]
pub async fn agent_folders() -> Result<Vec<AgentFolder>, String> {
    blocking(folders::status).await
}

/// Read `agent`'s sessions from the picked folder, or from its default again with None. The window then gets
/// "agents-changed", so it reloads and watches the new folder.
#[tauri::command]
pub async fn agent_folder_set(app: AppHandle, agent: Agent, path: Option<String>) -> Result<Vec<AgentFolder>, String> {
    let folder = match path {
        Some(picked) => folders::from_picked(agent, &picked)?,
        None => None,
    };
    let mut chosen = folders::chosen();
    chosen.set(agent, folder);
    app_data::write(&app, FILE, &chosen)?;
    folders::set_chosen(chosen);
    let _ = app.emit("agents-changed", ());
    blocking(folders::status).await
}
