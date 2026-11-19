//! Settings → Files: the patterns of files to leave out of the review (data/left_out.rs). Kept in left-out.json in
//! the app's data folder and set again each time the app starts. Applies to every repo.
use crate::app_data;
use crate::data::left_out;
use tauri::{AppHandle, Emitter};

const FILE: &str = "left-out.json";

/// Use the patterns saved earlier; called once when the app starts, before the window asks for anything.
pub fn load(app: &AppHandle) {
    left_out::set_patterns(&saved(app));
}

fn saved(app: &AppHandle) -> Vec<String> {
    app_data::read(app, FILE).unwrap_or_default()
}

/// The patterns, in the order they were added.
#[tauri::command]
pub fn left_out_patterns(app: AppHandle) -> Vec<String> {
    saved(&app)
}

/// Save the whole list. Each pattern is tidied (trimmed, a leading `/` dropped) and repeats are dropped; one that
/// can't be used comes back as a plain-language reason and nothing is saved. The window then gets
/// "sources-changed", so the open repo reloads without the left-out files.
#[tauri::command]
pub fn left_out_set(app: AppHandle, patterns: Vec<String>) -> Result<Vec<String>, String> {
    let mut tidy: Vec<String> = Vec::new();
    for pattern in &patterns {
        let pattern = left_out::tidy(pattern)?;
        if !tidy.contains(&pattern) {
            tidy.push(pattern);
        }
    }
    app_data::write(&app, FILE, &tidy)?;
    left_out::set_patterns(&tidy);
    let _ = app.emit("sources-changed", ());
    Ok(tidy)
}
