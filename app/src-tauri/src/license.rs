//! The license and the 14-day trial, checked offline. A license key is a small JSON record (who bought it, when)
//! signed with a private key that never leaves the seller's machine (examples/license.rs makes keys); the app holds
//! only the matching public key, so it can tell a real key from a made-up one without asking a server.
//!
//! Kept in license.json in the app's data folder, apart from state.json so the window's saved settings never touch
//! it. The trial starts the first time the app opens. Deleting the file (or reinstalling) starts a new trial; that is
//! accepted. Turning the clock back gains nothing: the trial counts from the latest time the app has seen.
use crate::app_data;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

/// The public half of the signing key. Made with `cargo run --example license -- new-keypair`.
const PUBLIC_KEY: [u8; 32] = [
    58, 219, 44, 3, 145, 130, 22, 149, 55, 4, 183, 43, 147, 9, 240, 76, 228, 171, 9, 83, 80, 136, 112, 252, 46, 169,
    119, 197, 220, 248, 5, 145,
];
pub const TRIAL_DAYS: i64 = 14;
const DAY: i64 = 24 * 60 * 60;

/// Who a license belongs to: what the signed record in a key says.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Holder {
    pub name: String,
    pub email: String,
    /// The order or license number, to look a buyer up.
    pub id: String,
    /// The day it was made, YYYY-MM-DD.
    pub issued: String,
}

/// A key as given to a buyer: the record and its signature, each in URL-safe base64, joined by a dot.
pub fn encode(holder: &Holder, sign: impl FnOnce(&[u8]) -> [u8; 64]) -> String {
    let record = serde_json::to_vec(holder).unwrap();
    format!("{}.{}", B64.encode(&record), B64.encode(sign(&record)))
}

/// Who a key belongs to, or a plain-language reason it isn't valid. Spaces and line breaks (from an email that
/// wrapped the key) are ignored.
pub fn verify(key: &str) -> Result<Holder, String> {
    verify_with(key, &PUBLIC_KEY)
}

fn verify_with(key: &str, public: &[u8; 32]) -> Result<Holder, String> {
    let bad =
        || "That isn't a valid license key. Copy the whole key from your purchase email and try again.".to_string();
    let key: String = key.chars().filter(|c| !c.is_whitespace()).collect();
    let (record, sig) = key.split_once('.').ok_or_else(bad)?;
    let record = B64.decode(record).map_err(|_| bad())?;
    let sig = Signature::from_slice(&B64.decode(sig).map_err(|_| bad())?).map_err(|_| bad())?;
    let public = VerifyingKey::from_bytes(public).map_err(|_| bad())?;
    public.verify_strict(&record, &sig).map_err(|_| bad())?;
    serde_json::from_slice(&record).map_err(|_| bad())
}

/// What license.json holds: when the trial started, the latest time seen, and the key once entered.
#[derive(Serialize, Deserialize, Default, Debug)]
struct Saved {
    trial_started: Option<i64>,
    last_seen: Option<i64>,
    key: Option<String>,
}

/// What the window is told.
#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "state", rename_all = "lowercase")]
pub enum Status {
    Licensed { holder: Holder },
    Trial { days_left: i64, ends: i64 },
    Ended { ended: i64 },
}

/// The status at `now` (seconds), starting the trial if it hasn't started. Updates `saved`; the caller writes it.
fn status_at(saved: &mut Saved, now: i64) -> Status {
    let now = now.max(saved.last_seen.unwrap_or(now));
    saved.last_seen = Some(now);
    let started = *saved.trial_started.get_or_insert(now);
    if let Some(holder) = saved.key.as_deref().and_then(|k| verify(k).ok()) {
        return Status::Licensed { holder };
    }
    let ends = started + TRIAL_DAYS * DAY;
    match ends - now {
        left if left > 0 => Status::Trial {
            days_left: (left + DAY - 1) / DAY,
            ends,
        },
        _ => Status::Ended { ended: ends },
    }
}

const FILE: &str = "license.json";

fn load(app: &AppHandle) -> Saved {
    app_data::read(app, FILE).unwrap_or_default()
}

fn save(app: &AppHandle, saved: &Saved) -> Result<(), String> {
    app_data::write(app, FILE, saved)
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

/// Licensed, in the trial (days left), or the trial has ended. The first call starts the trial.
#[tauri::command]
pub fn license_status(app: AppHandle) -> Status {
    let mut saved = load(&app);
    let status = status_at(&mut saved, now());
    let _ = save(&app, &saved);
    status
}

/// Enter a license key: saved when it is valid, otherwise the reason it isn't.
#[tauri::command]
pub fn license_activate(app: AppHandle, key: String) -> Result<Status, String> {
    verify(&key)?;
    let mut saved = load(&app);
    saved.key = Some(key.chars().filter(|c| !c.is_whitespace()).collect());
    let status = status_at(&mut saved, now());
    save(&app, &saved)?;
    Ok(status)
}

/// Take the license off this Mac (before moving to another one). The trial's dates stay as they were.
#[tauri::command]
pub fn license_remove(app: AppHandle) -> Result<Status, String> {
    let mut saved = load(&app);
    saved.key = None;
    let status = status_at(&mut saved, now());
    save(&app, &saved)?;
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn holder() -> Holder {
        Holder {
            name: "Ada".into(),
            email: "ada@example.com".into(),
            id: "1".into(),
            issued: "2026-11-16".into(),
        }
    }

    #[test]
    fn keys() {
        let signer = SigningKey::from_bytes(&[7; 32]);
        let public = signer.verifying_key().to_bytes();
        let key = encode(&holder(), |r| signer.sign(r).to_bytes());
        assert_eq!(verify_with(&key, &public), Ok(holder()));
        // Wrapped across lines in an email: still fine.
        let wrapped: String = key
            .chars()
            .enumerate()
            .flat_map(|(i, c)| if i % 40 == 39 { vec![c, '\n', ' '] } else { vec![c] })
            .collect();
        assert_eq!(verify_with(&wrapped, &public), Ok(holder()));
        // Someone else's name with the old signature, a key from another signing key, junk: all refused.
        let (_, sig) = key.split_once('.').unwrap();
        let mut other = holder();
        other.name = "Bob".into();
        let forged = format!("{}.{sig}", B64.encode(serde_json::to_vec(&other).unwrap()));
        assert!(verify_with(&forged, &public).is_err());
        let stranger = SigningKey::from_bytes(&[8; 32]);
        assert!(verify_with(&encode(&holder(), |r| stranger.sign(r).to_bytes()), &public).is_err());
        assert!(verify_with("hello", &public).is_err());
        assert!(verify_with("", &public).is_err());
    }

    #[test]
    fn trial() {
        let mut s = Saved::default();
        let t0 = 1_800_000_000;
        assert_eq!(
            status_at(&mut s, t0),
            Status::Trial {
                days_left: 14,
                ends: t0 + 14 * DAY
            }
        );
        assert_eq!(s.trial_started, Some(t0));
        assert_eq!(
            status_at(&mut s, t0 + DAY),
            Status::Trial {
                days_left: 13,
                ends: t0 + 14 * DAY
            }
        );
        assert_eq!(
            status_at(&mut s, t0 + 13 * DAY + 1),
            Status::Trial {
                days_left: 1,
                ends: t0 + 14 * DAY
            }
        );
        assert_eq!(status_at(&mut s, t0 + 14 * DAY), Status::Ended { ended: t0 + 14 * DAY });
        // Turning the clock back doesn't bring the trial back.
        assert_eq!(status_at(&mut s, t0 + 2 * DAY), Status::Ended { ended: t0 + 14 * DAY });
        // A key that doesn't check out is ignored.
        s.key = Some("made-up".into());
        assert_eq!(status_at(&mut s, t0 + 20 * DAY), Status::Ended { ended: t0 + 14 * DAY });
    }
}
