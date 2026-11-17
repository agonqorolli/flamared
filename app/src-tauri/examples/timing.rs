//! How long a snapshot takes, first load and reload: cargo run --release --example timing -- <repo> [base]
use std::time::Instant;
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (repo, base) = (args[0].as_str(), args.get(1).map(String::as_str).unwrap_or("HEAD"));
    for label in ["first load", "reload", "reload"] {
        let started = Instant::now();
        let _ = app_lib::data::snapshot::build(repo, base, &app_lib::data::tree::At::Work);
        eprintln!("{label:<10} {:>6} ms", started.elapsed().as_millis());
    }
}
