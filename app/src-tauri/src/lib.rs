pub mod data;
pub mod license;
mod state;
pub mod watch;

/// Everything the screens show for one repo, on the checked-out branch or another one (read-only). Runs off the
/// main thread: it reads git and every session file.
#[tauri::command]
async fn snapshot(repo: String, branch: Option<String>) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || data::snapshot::view(&repo, branch.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

/// The repo a picked folder belongs to (its top folder), or a plain-language reason it can't be opened.
#[tauri::command]
fn repo_root(path: String) -> Result<String, String> {
    let top = data::git::git_or_empty(&path, &["rev-parse", "--show-toplevel"]).trim().to_string();
    if top.is_empty() {
        return Err(format!("{path} isn't inside a git repository."));
    }
    Ok(data::paths::realpath(&top))
}

/// Repos agents have worked in on this machine, most recent first (the app opens the first one).
#[tauri::command]
async fn repos() -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(|| data::snapshot::known_repos(None)).await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(watch::Watching::default())
        .manage(state::State::default())
        .invoke_handler(tauri::generate_handler![snapshot, repos, repo_root, watch::watch, state::state_load, state::state_save, license::license_status, license::license_activate, license::license_remove])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
