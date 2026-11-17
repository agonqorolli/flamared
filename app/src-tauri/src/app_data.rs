//! The app's own files in its data folder (~/Library/Application Support/com.flamared/ on a Mac):
//! state.json and license.json. Each is a small JSON file, read whole and written whole.
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Where the file of that name is; makes the data folder the first time.
fn path_of(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

/// What a file holds, or None when it is missing or isn't what `T` expects.
pub fn read<T: DeserializeOwned>(app: &AppHandle, name: &str) -> Option<T> {
    let text = std::fs::read_to_string(path_of(app, name).ok()?).ok()?;
    serde_json::from_str(&text).ok()
}

/// Saves a file by writing a temporary one and renaming it over the old one, so a crash mid-write never leaves a
/// half-written file.
pub fn write(app: &AppHandle, name: &str, value: &impl Serialize) -> Result<(), String> {
    let path = path_of(app, name)?;
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
