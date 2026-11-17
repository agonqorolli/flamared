//! The app's own saved state (settings, review marks, last repo...) as one JSON file in the app's data folder,
//! e.g. ~/Library/Application Support/com.flamared/state.json. Values are strings, like
//! localStorage, so the window code reads and writes them the same way.
use crate::app_data;
use serde_json::{Map, Value};
use std::sync::Mutex;
use tauri::AppHandle;

const FILE: &str = "state.json";

/// Everything saved, read from the file the first time it is asked for.
#[derive(Default)]
pub struct State(Mutex<Option<Map<String, Value>>>);

fn loaded<'a>(app: &AppHandle, slot: &'a mut Option<Map<String, Value>>) -> &'a mut Map<String, Value> {
    slot.get_or_insert_with(|| app_data::read(app, FILE).unwrap_or_default())
}

/// Everything saved, read once when the window opens.
#[tauri::command]
pub fn state_load(app: AppHandle, state: tauri::State<'_, State>) -> Map<String, Value> {
    loaded(&app, &mut state.0.lock().unwrap()).clone()
}

/// Save one value (None removes it).
#[tauri::command]
pub fn state_save(
    app: AppHandle,
    state: tauri::State<'_, State>,
    key: String,
    value: Option<String>,
) -> Result<(), String> {
    let mut slot = state.0.lock().unwrap();
    let saved = loaded(&app, &mut slot);
    match value {
        Some(value) => saved.insert(key, Value::String(value)),
        None => saved.remove(&key),
    };
    app_data::write(&app, FILE, saved)
}
