//! The Rust side of the app: the data layer, the commands the window calls, live watching, saved state and the
//! license, where the agents' sessions are read from, and what Settings → About shows.
mod about;
mod agents;
mod app_data;
mod commands;
pub mod data;
pub mod license;
mod state;
pub mod watch;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Updates: where to look and the key they must be signed with are in tauri.conf.json ("plugins.updater").
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(watch::Watching::default())
        .manage(state::State::default())
        .setup(|app| {
            agents::load(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::snapshot,
            commands::repos,
            commands::repo_root,
            commands::repo_status,
            commands::branch_files,
            watch::watch,
            state::state_load,
            state::state_save,
            license::license_status,
            license::license_activate,
            license::license_remove,
            agents::agent_folders,
            agents::agent_folder_set,
            about::about
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
