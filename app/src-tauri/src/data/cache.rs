//! Remembering what was read from a file until the file changes, so a reload only re-reads what was written to
//! since. Used for session files and for the map's line counts.
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

/// A file's modification time and size: when neither changed, what was read from it last time still holds.
type Stamp = (SystemTime, u64);

/// What was read from each file (by path), with the stamp the file had then.
pub type Stamped<T> = Mutex<HashMap<String, (Stamp, Arc<T>)>>;

fn stamp(path: &str) -> Option<Stamp> {
    let meta = std::fs::metadata(path).ok()?;
    Some((meta.modified().ok()?, meta.len()))
}

/// `read()` for the file at `path`, or what it gave last time when the file hasn't changed since.
pub fn cached<T>(cache: &Stamped<T>, path: &str, read: impl FnOnce() -> T) -> Arc<T> {
    let now = stamp(path);
    if let (Some(now), Some((then, value))) = (now, cache.lock().unwrap().get(path))
        && *then == now
    {
        return value.clone();
    }
    let value = Arc::new(read());
    if let Some(now) = now {
        cache.lock().unwrap().insert(path.to_string(), (now, value.clone()));
    }
    value
}
