pub mod data;

/// Everything the screens show for one repo. Runs off the main thread: it reads git and every session file.
#[tauri::command]
async fn snapshot(repo: String, base: Option<String>) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || data::snapshot::build(&repo, base.as_deref().unwrap_or("HEAD")))
        .await
        .map_err(|e| e.to_string())?
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
        .invoke_handler(tauri::generate_handler![snapshot, repos])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
