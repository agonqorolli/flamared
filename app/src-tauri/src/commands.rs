//! The commands the window calls for a repo's data. Each is a thin wrapper: the work is in `data/`, and anything
//! that reads git or session files runs off the main thread. The window's side of each is in app/src/lib/api.ts.
//! (watch.rs, state.rs and license.rs hold the commands for their own parts.)
use crate::data::repos::{known_repos, status_of_each};
use crate::data::snapshot::model::{BranchFiles, RepoRow, RepoStatus, Snapshot};
use crate::data::{branches, git};
use indexmap::IndexMap;

/// Runs work that reads git or session files, off the main thread.
pub(crate) async fn blocking<T: Send + 'static>(work: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())
}

/// Everything the screens show for one repo, on the checked-out branch or another one (read-only).
#[tauri::command]
pub async fn snapshot(repo: String, branch: Option<String>) -> Result<Snapshot, String> {
    blocking(move || crate::data::snapshot::view(&repo, branch.as_deref())).await?
}

/// One changed file's whole diff, for Show all: the snapshot's diffs are cut at 400 lines.
#[tauri::command]
pub async fn file_diff(repo: String, branch: Option<String>, path: String) -> Result<String, String> {
    blocking(move || crate::data::snapshot::file_diff(&repo, branch.as_deref(), &path)).await?
}

/// The repo a picked folder belongs to (its top folder), or a plain-language reason it can't be opened.
#[tauri::command]
pub fn repo_root(path: String) -> Result<String, String> {
    git::toplevel(&path).map_err(|_| format!("{path} isn't inside a git repository."))
}

/// Repos agents have worked in on this machine, most recent first (the app opens the first one).
#[tauri::command]
pub async fn repos() -> Result<Vec<RepoRow>, String> {
    blocking(|| known_repos(None)).await
}

/// For the repo picker when it opens: each repo's checked-out branch and uncommitted files, read in parallel.
#[tauri::command]
pub async fn repo_status(repos: Vec<String>) -> Result<Vec<RepoStatus>, String> {
    blocking(move || status_of_each(&repos)).await
}

/// For the branch picker when it opens: how many files each branch changed.
#[tauri::command]
pub async fn branch_files(repo: String) -> Result<IndexMap<String, BranchFiles>, String> {
    blocking(move || branches::branch_files(&repo)).await?
}
