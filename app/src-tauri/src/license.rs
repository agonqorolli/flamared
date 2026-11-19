//! The license and the 5-day trial, checked offline. A license key is a small JSON record (who bought it, when)
//! signed with a private key that never leaves the seller's machine (examples/license.rs makes keys); the app holds
//! only the matching public key, so it can tell a real key from a made-up one without asking a server.
//!
//! A purchase includes a year of new versions; renewing adds another year (a new key with a later `updates_until`).
//! A version released after a key's updates ended doesn't take that key: the version you had keeps working, and the
//! updater doesn't install one the key doesn't cover. Each build knows the day it was made (build.rs).
//!
//! Kept in license.json in the app's data folder, apart from state.json so the window's saved settings never touch
//! it. The trial starts the first time the app opens. Deleting the file (or reinstalling) starts a new trial; that is
//! accepted. Turning the clock back gains nothing: the trial counts from the latest time the app has seen.
use crate::app_data;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64;
use chrono::{Months, NaiveDate};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

/// The public half of the signing key. Made with `cargo run --example license -- new-keypair`.
const PUBLIC_KEY: [u8; 32] = [
    58, 219, 44, 3, 145, 130, 22, 149, 55, 4, 183, 43, 147, 9, 240, 76, 228, 171, 9, 83, 80, 136, 112, 252, 46, 169,
    119, 197, 220, 248, 5, 145,
];
pub const TRIAL_DAYS: i64 = 5;
const DAY: i64 = 24 * 60 * 60;
/// How long a purchase or a renewal includes new versions.
const UPDATE_MONTHS: u32 = 12;
/// The day this build was made, YYYY-MM-DD (build.rs; `FLAMARED_RELEASED` overrides it for testing).
pub const RELEASED: &str = env!("FLAMARED_RELEASED");
const DAY_FORMAT: &str = "%Y-%m-%d";

/// Who a license belongs to: what the signed record in a key says.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Holder {
    pub name: String,
    pub email: String,
    /// The order or license number, to look a buyer up.
    pub id: String,
    /// The day it was made, YYYY-MM-DD.
    pub issued: String,
    /// The last day whose new versions it covers, YYYY-MM-DD. Left out: a year after `issued`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updates_until: Option<String>,
}

impl Holder {
    /// The last day of updates, YYYY-MM-DD: the one written in the key, or a year after it was made.
    pub fn covered_until(&self) -> String {
        self.updates_until
            .clone()
            .unwrap_or_else(|| a_year_after(&self.issued).unwrap_or_else(|| self.issued.clone()))
    }

    /// Whether a version made on `released` (YYYY-MM-DD) came out while this key's updates lasted.
    pub fn covers(&self, released: &str) -> bool {
        released <= self.covered_until().as_str()
    }
}

/// The last day of updates for a renewal made on `today`: a year on from where the old key's updates end, or from
/// today if they have already ended, so renewing early loses nothing.
pub fn renewed_until(old: &Holder, today: &str) -> Option<String> {
    a_year_after(old.covered_until().as_str().max(today))
}

/// The same day a year later (Feb 29 becomes Feb 28), YYYY-MM-DD.
fn a_year_after(day: &str) -> Option<String> {
    let date = NaiveDate::parse_from_str(day, DAY_FORMAT).ok()?;
    Some(
        date.checked_add_months(Months::new(UPDATE_MONTHS))?
            .format(DAY_FORMAT)
            .to_string(),
    )
}

/// "Nov 15, 2026", for messages; the day as given if it isn't a date.
fn long_date(day: &str) -> String {
    NaiveDate::parse_from_str(day, DAY_FORMAT)
        .map_or_else(|_| day.to_string(), |date| date.format("%b %-d, %Y").to_string())
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
    Licensed {
        holder: Holder,
        updates_until: String,
    },
    Trial {
        days_left: i64,
        ends: i64,
    },
    Ended {
        ended: i64,
    },
    /// A real key whose updates ended before this version (made on `released`) came out.
    #[serde(rename = "not_covered")]
    NotCovered {
        holder: Holder,
        updates_until: String,
        released: String,
    },
}

/// The status at `now` (seconds) of a build made on `released`, starting the trial if it hasn't started. Updates
/// `saved`; the caller writes it.
fn status_at(saved: &mut Saved, now: i64, released: &str) -> Status {
    let now = now.max(saved.last_seen.unwrap_or(now));
    saved.last_seen = Some(now);
    let started = *saved.trial_started.get_or_insert(now);
    if let Some(holder) = saved.key.as_deref().and_then(|k| verify(k).ok()) {
        return licensed(holder, released);
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

/// The status a real key gives a build made on `released`: licensed, or not covered once its updates had ended.
fn licensed(holder: Holder, released: &str) -> Status {
    let updates_until = holder.covered_until();
    if holder.covers(released) {
        return Status::Licensed { holder, updates_until };
    }
    Status::NotCovered {
        holder,
        updates_until,
        released: released.to_string(),
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
    let status = status_at(&mut saved, now(), RELEASED);
    let _ = save(&app, &saved);
    status
}

/// Why a real key can't be used with a build made on `released`, if it can't.
fn not_covered_reason(holder: &Holder, released: &str) -> Option<String> {
    if holder.covers(released) {
        return None;
    }
    let until = long_date(&holder.covered_until());
    Some(format!(
        "This key's updates ended on {until}, and this version came out on {}. Renew for another year of updates, or use a version from before {until}.",
        long_date(released)
    ))
}

/// Enter a license key: saved when it is valid for this version, otherwise the reason it isn't.
#[tauri::command]
pub fn license_activate(app: AppHandle, key: String) -> Result<Status, String> {
    let holder = verify(&key)?;
    if let Some(reason) = not_covered_reason(&holder, RELEASED) {
        return Err(reason);
    }
    let mut saved = load(&app);
    saved.key = Some(key.chars().filter(|c| !c.is_whitespace()).collect());
    let status = status_at(&mut saved, now(), RELEASED);
    save(&app, &saved)?;
    Ok(status)
}

/// Take the license off this Mac (before moving to another one). The trial's dates stay as they were.
#[tauri::command]
pub fn license_remove(app: AppHandle) -> Result<Status, String> {
    let mut saved = load(&app);
    saved.key = None;
    let status = status_at(&mut saved, now(), RELEASED);
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
            updates_until: None,
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
            status_at(&mut s, t0, RELEASED),
            Status::Trial {
                days_left: 5,
                ends: t0 + 5 * DAY
            }
        );
        assert_eq!(s.trial_started, Some(t0));
        assert_eq!(
            status_at(&mut s, t0 + DAY, RELEASED),
            Status::Trial {
                days_left: 4,
                ends: t0 + 5 * DAY
            }
        );
        assert_eq!(
            status_at(&mut s, t0 + 4 * DAY + 1, RELEASED),
            Status::Trial {
                days_left: 1,
                ends: t0 + 5 * DAY
            }
        );
        assert_eq!(
            status_at(&mut s, t0 + 5 * DAY, RELEASED),
            Status::Ended { ended: t0 + 5 * DAY }
        );
        // Turning the clock back doesn't bring the trial back.
        assert_eq!(
            status_at(&mut s, t0 + 2 * DAY, RELEASED),
            Status::Ended { ended: t0 + 5 * DAY }
        );
        // A key that doesn't check out is ignored.
        s.key = Some("made-up".into());
        assert_eq!(
            status_at(&mut s, t0 + 20 * DAY, RELEASED),
            Status::Ended { ended: t0 + 5 * DAY }
        );
    }

    #[test]
    fn updates() {
        // A year after the key was made, or the day written in it; Feb 29 becomes Feb 28.
        assert_eq!(holder().covered_until(), "2027-11-16");
        let leap = Holder {
            issued: "2028-02-29".into(),
            ..holder()
        };
        assert_eq!(leap.covered_until(), "2029-02-28");
        let renewed = Holder {
            updates_until: Some("2028-11-16".into()),
            ..holder()
        };
        assert_eq!(renewed.covered_until(), "2028-11-16");
        // The last day still counts; the day after doesn't.
        assert!(holder().covers("2027-11-16"));
        assert!(!holder().covers("2027-11-17"));
        assert!(not_covered_reason(&holder(), "2027-11-16").is_none());
        assert_eq!(
            not_covered_reason(&holder(), "2027-12-03").as_deref(),
            Some(
                "This key's updates ended on Nov 16, 2027, and this version came out on Dec 3, 2027. Renew for another year of updates, or use a version from before Nov 16, 2027."
            )
        );
        assert_eq!(
            licensed(holder(), "2027-01-10"),
            Status::Licensed {
                holder: holder(),
                updates_until: "2027-11-16".into()
            }
        );
        assert_eq!(
            licensed(holder(), "2027-12-03"),
            Status::NotCovered {
                holder: holder(),
                updates_until: "2027-11-16".into(),
                released: "2027-12-03".into()
            }
        );
        // Renewing early adds a year to the end; renewing late adds a year from the day of the renewal.
        assert_eq!(renewed_until(&holder(), "2027-06-01").as_deref(), Some("2028-11-16"));
        assert_eq!(renewed_until(&holder(), "2028-03-15").as_deref(), Some("2029-03-15"));
    }

    #[test]
    fn old_keys_still_read() {
        // A key made before `updates_until` existed has no such field; its record still reads, and the field is
        // left out of new records that don't set it, so their bytes (and signatures) stay the same.
        let old = r#"{"name":"Ada","email":"ada@example.com","id":"1","issued":"2026-11-16"}"#;
        assert_eq!(serde_json::from_str::<Holder>(old).unwrap(), holder());
        assert_eq!(serde_json::to_string(&holder()).unwrap(), old);
    }
}
