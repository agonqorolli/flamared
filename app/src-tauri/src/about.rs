//! Settings → About: what the window can't read itself — the macOS version (for a problem report) and where the
//! app keeps its own files.
use crate::app_data;
use crate::data::paths::{home, tilde};
use serde::Serialize;
use std::process::Command;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct About {
    /// "macOS 26.1 (aarch64)"; just "macOS" when the version can't be read
    pub system: String,
    pub data_folder: String,
    /// The data folder as shown: with ~ for the home folder.
    pub data_folder_shown: String,
}

/// The macOS version, as `sw_vers` reports it (the web view always claims an old one).
fn macos_version() -> Option<String> {
    let output = Command::new("sw_vers").arg("-productVersion").output().ok()?;
    let version = String::from_utf8(output.stdout).ok()?.trim().to_string();
    (!version.is_empty()).then_some(version)
}

#[tauri::command]
pub fn about(app: AppHandle) -> Result<About, String> {
    let folder = app_data::folder(&app)?.to_string_lossy().into_owned();
    let system = match macos_version() {
        Some(version) => format!("macOS {version} ({})", std::env::consts::ARCH),
        None => "macOS".to_string(),
    };
    Ok(About {
        system,
        data_folder_shown: tilde(&folder, &home()),
        data_folder: folder,
    })
}
