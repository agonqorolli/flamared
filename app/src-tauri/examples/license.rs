//! Make license keys for buyers. The private signing key lives outside the repo, in ~/.flamared-keys/; keep a
//! backup of it somewhere safe (a password manager). Losing it means new keys need a new app release; leaking it
//! means anyone can make keys.
//!   cargo run --example license -- new-keypair                      once: makes the signing key, prints the public key
//!   cargo run --example license -- issue "<name>" <email> [order]   prints a license key to send to the buyer
//!   cargo run --example license -- check <key>                      who a key belongs to, as the app sees it
use app_lib::license::{Holder, encode, verify};
use ed25519_dalek::{Signer, SigningKey};
use std::io::Read;
use std::path::PathBuf;

fn key_file() -> PathBuf {
    PathBuf::from(std::env::var("HOME").expect("HOME")).join(".flamared-keys/license-signing.key")
}

fn signer() -> SigningKey {
    let bytes = std::fs::read(key_file()).unwrap_or_else(|_| fail(&format!("No signing key at {}. Run new-keypair first.", key_file().display())));
    SigningKey::from_bytes(&bytes.try_into().unwrap_or_else(|_| fail("The signing key file is damaged.")))
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
                fail(&format!("{} already exists. Keys made with it would stop working if it were replaced.", path.display()));
            }
            let mut seed = [0u8; 32];
            std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut seed)).expect("random bytes");
            std::fs::create_dir_all(path.parent().unwrap()).expect("key folder");
            std::fs::write(&path, seed).expect("write key");
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).expect("key permissions");
            let public = SigningKey::from_bytes(&seed).verifying_key().to_bytes();
            println!("Signing key saved to {} (back it up).", path.display());
            println!("Public key for src/license.rs:\nconst PUBLIC_KEY: [u8; 32] = {public:?};");
        }
        Some("issue") => {
            let (Some(name), Some(email)) = (args.get(1), args.get(2)) else { fail("usage: issue \"<name>\" <email> [order]") };
            let issued = chrono::Local::now().format("%Y-%m-%d").to_string();
            let id = args.get(3).cloned().unwrap_or_else(|| chrono::Local::now().format("%Y%m%d%H%M%S").to_string());
            let signer = signer();
            let key = encode(&Holder { name: name.clone(), email: email.clone(), id, issued }, |r| signer.sign(r).to_bytes());
            match verify(&key) {
                Ok(_) => println!("{key}"),
                Err(_) => fail("Made a key, but the app wouldn't accept it: the public key in src/license.rs doesn't match this signing key."),
            }
        }
        Some("check") => match verify(&args[1..].join("")) {
            Ok(h) => println!("Valid: {} <{}>, order {}, made {}", h.name, h.email, h.id, h.issued),
            Err(e) => fail(&e),
        },
        _ => fail("usage: license new-keypair | issue \"<name>\" <email> [order] | check <key>"),
    }
}
