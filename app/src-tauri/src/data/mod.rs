//! The data layer: reads a git repo and the agent sessions on this machine, and builds what the screens show.
//! Read-only for the repo and for every agent's folder. No AI, no network.
pub mod activity;
mod codex_shell;
pub mod git;
pub mod group;
pub mod paths;
pub mod sessions;
pub mod snapshot;
pub mod tree;
