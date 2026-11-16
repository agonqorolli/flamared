//! How long a snapshot takes, first load and reload: cargo run --release --example timing -- <repo> [base]
use std::time::Instant;
fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let (repo, base) = (a[0].as_str(), a.get(1).map(String::as_str).unwrap_or("HEAD"));
    for label in ["first load", "reload", "reload"] {
        let t = Instant::now();
        let _ = app_lib::data::snapshot::build(repo, base, &app_lib::data::tree::At::Work);
        eprintln!("{label:<10} {:>6} ms", t.elapsed().as_millis());
    }
}
