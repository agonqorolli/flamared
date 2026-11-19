//! Make license keys for buyers. The private signing key lives outside the repo, in ~/.flamared-keys/; keep a
//! backup of it somewhere safe (a password manager). Losing it means new keys need a new app release; leaking it
//! means anyone can make keys.
//!   cargo run --example license -- new-keypair                      once: makes the signing key, prints the public key
//!   cargo run --example license -- issue "<name>" <email> [order]   prints a license key to send to the buyer
//!                                                                   (updates for a year; --until YYYY-MM-DD sets the end)
//!   cargo run --example license -- renew <key> [order]              a new key for the same buyer with a year more updates
//!   cargo run --example license -- check <key>                      who a key belongs to, as the app sees it
use app_lib::license::{Holder, encode, renewed_until, verify};
use ed25519_dalek::{Signer, SigningKey};
use std::io::Read;
use std::path::PathBuf;

fn key_file() -> PathBuf {
    PathBuf::from(std::env::var("HOME").expect("HOME")).join(".flamared-keys/license-signing.key")
}

fn signer() -> SigningKey {
    let bytes = std::fs::read(key_file()).unwrap_or_else(|_| {
        fail(&format!(
            "No signing key at {}. Run new-keypair first.",
            key_file().display()
        ))
    });
    SigningKey::from_bytes(
        &bytes
            .try_into()
            .unwrap_or_else(|_| fail("The signing key file is damaged.")),
    )
}

/// Signs a key for `holder` and prints it with the last day of its updates, after checking the app would accept it.
fn print_key(holder: Holder) {
    let signer = signer();
    let key = encode(&holder, |r| signer.sign(r).to_bytes());
    match verify(&key) {
        Ok(holder) => println!("{key}\n\nUpdates until {}.", holder.covered_until()),
        Err(_) => fail(
            "Made a key, but the app wouldn't accept it: the public key in src/license.rs doesn't match this signing key.",
        ),
    }
}

/// The arguments without `--until <day>`, and that day if it was given (checked to be YYYY-MM-DD).
fn take_until(args: &[String]) -> (Vec<String>, Option<String>) {
    let Some(at) = args.iter().position(|a| a == "--until") else {
        return (args.to_vec(), None);
    };
    let day = args
        .get(at + 1)
        .unwrap_or_else(|| fail("--until needs a day, YYYY-MM-DD"));
    if chrono::NaiveDate::parse_from_str(day, "%Y-%m-%d").is_err() {
        fail("--until needs a day, YYYY-MM-DD");
    }
    let rest = args
        .iter()
        .enumerate()
        .filter(|(i, _)| *i != at && *i != at + 1)
        .map(|(_, a)| a.clone());
    (rest.collect(), Some(day.clone()))
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// An order number from the time, when none is given.
fn order_now() -> String {
    chrono::Local::now().format("%Y%m%d%H%M%S").to_string()
}

fn fail(msg: &str) -> ! {
    eprintln!("{msg}");
    std::process::exit(1);
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("new-keypair") => {
            let path = key_file();
            if path.exists() {
                fail(&format!(
                    "{} already exists. Keys made with it would stop working if it were replaced.",
                    path.display()
                ));
            }
            let mut seed = [0u8; 32];
            std::fs::File::open("/dev/urandom")
                .and_then(|mut f| f.read_exact(&mut seed))
                .expect("random bytes");
            std::fs::create_dir_all(path.parent().unwrap()).expect("key folder");
            std::fs::write(&path, seed).expect("write key");
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).expect("key permissions");
            let public = SigningKey::from_bytes(&seed).verifying_key().to_bytes();
            println!("Signing key saved to {} (back it up).", path.display());
            println!("Public key for src/license.rs:\nconst PUBLIC_KEY: [u8; 32] = {public:?};");
        }
        Some("issue") => {
            let (rest, until) = take_until(&args[1..]);
            let (Some(name), Some(email)) = (rest.first(), rest.get(1)) else {
                fail("usage: issue \"<name>\" <email> [order] [--until YYYY-MM-DD]")
            };
            print_key(Holder {
                name: name.clone(),
                email: email.clone(),
                id: rest.get(2).cloned().unwrap_or_else(order_now),
                issued: today(),
                updates_until: until,
            });
        }
        Some("renew") => {
            let Some(old) = args.get(1) else {
                fail("usage: renew <key> [order]")
            };
            let old = verify(old).unwrap_or_else(|e| fail(&e));
            let until = renewed_until(&old, &today()).unwrap_or_else(|| fail("The old key's dates don't read."));
            print_key(Holder {
                id: args.get(2).cloned().unwrap_or_else(order_now),
                issued: today(),
                updates_until: Some(until),
                ..old
            });
        }
        Some("check") => match verify(&args[1..].join("")) {
            Ok(h) => println!(
                "Valid: {} <{}>, order {}, made {}, updates until {}",
                h.name,
                h.email,
                h.id,
                h.issued,
                h.covered_until()
            ),
            Err(e) => fail(&e),
        },
        _ => fail(
            "usage: license new-keypair | issue \"<name>\" <email> [order] [--until YYYY-MM-DD] | renew <key> [order] | check <key>",
        ),
    }
}
