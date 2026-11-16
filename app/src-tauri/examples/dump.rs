//! Print a repo's snapshot as JSON:
//!   cargo run --example dump -- <repo> [base]
//!   cargo run --example dump -- <repo> --branch <name>     (how the app shows another branch)
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let repo = args.first().expect("usage: dump <repo> [base]");
    let base = args.get(1).map(String::as_str).unwrap_or("HEAD");
    let result = if base == "--branch" {
        app_lib::data::snapshot::view(repo, args.get(2).map(String::as_str))
    } else {
        app_lib::data::snapshot::build(repo, base, &app_lib::data::tree::At::Work)
    };
    match result {
        Ok(v) => println!("{}", serde_json::to_string(&v).unwrap()),
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }
}
