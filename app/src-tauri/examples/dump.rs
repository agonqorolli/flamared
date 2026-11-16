//! Print a repo's snapshot as JSON:
//!   cargo run --example dump -- <repo> [base]
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let repo = args.first().expect("usage: dump <repo> [base]");
    let base = args.get(1).map(String::as_str).unwrap_or("HEAD");
    match app_lib::data::snapshot::build(repo, base) {
        Ok(v) => println!("{}", serde_json::to_string(&v).unwrap()),
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }
}
