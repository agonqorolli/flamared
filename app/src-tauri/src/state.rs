//! The app's own saved state (settings, review marks, last repo...) as one JSON file in the app's data folder,
//! e.g. ~/Library/Application Support/com.flamared/state.json. Values are strings, like
//! localStorage, so the window code reads and writes them the same way.
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct State(Mutex<Option<Map<String, Value>>>);

fn file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("state.json"))
}

fn loaded<'a>(app: &AppHandle, slot: &'a mut Option<Map<String, Value>>) -> &'a mut Map<String, Value> {
    slot.get_or_insert_with(|| {
        file(app)
            .ok()
            .and_then(|f| std::fs::read_to_string(f).ok())
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default()
    })
}

/// Everything saved, read once when the window opens.
#[tauri::command]
pub fn state_load(app: AppHandle, state: tauri::State<'_, State>) -> Map<String, Value> {
    loaded(&app, &mut state.0.lock().unwrap()).clone()
}

/// Save one value (None removes it). Writes a temporary file and renames it over the old one, so a crash mid-write
/// never leaves a half-written file.
#[tauri::command]
pub fn state_save(app: AppHandle, state: tauri::State<'_, State>, key: String, value: Option<String>) -> Result<(), String> {
    let mut slot = state.0.lock().unwrap();
    let map = loaded(&app, &mut slot);
    match value {
        Some(v) => map.insert(key, Value::String(v)),
        None => map.remove(&key),
    };
    let path = file(&app)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(map).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
