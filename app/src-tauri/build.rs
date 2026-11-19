//! Stamps the build with the day it was made, which license.rs compares with how long a key's updates last. A
//! release bumps the version in tauri.conf.json, which makes this run again; `FLAMARED_RELEASED=YYYY-MM-DD` sets the
//! day by hand (to test a key whose updates have ended).
fn main() {
    println!("cargo:rerun-if-env-changed=FLAMARED_RELEASED");
    let released =
        std::env::var("FLAMARED_RELEASED").unwrap_or_else(|_| chrono::Utc::now().format("%Y-%m-%d").to_string());
    println!("cargo:rustc-env=FLAMARED_RELEASED={released}");
    tauri_build::build()
}
