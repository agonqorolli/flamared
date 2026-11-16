//! Check what the watcher reacts to, on a throwaway repo:
//!   cargo run --example watch_probe -- <empty folder>
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use std::{fs, process::Command, thread::sleep};

fn git(dir: &str, args: &[&str]) {
    Command::new("git").arg("-C").arg(dir).args(args).output().unwrap();
}

fn main() {
    let dir = std::env::args().nth(1).expect("usage: watch_probe <empty folder>");
    let sessions = format!("{dir}-sessions");
    fs::create_dir_all(&dir).unwrap();
    fs::create_dir_all(&sessions).unwrap();
    git(&dir, &["init", "-q"]);
    fs::write(format!("{dir}/.gitignore"), "node_modules/\n").unwrap();
    fs::write(format!("{dir}/a.ts"), "export const a = 1;\n").unwrap();
    git(&dir, &["add", "."]);
    git(&dir, &["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "start"]);
    let n = Arc::new(AtomicUsize::new(0));
    let n2 = n.clone();
    let _w = app_lib::watch::start(&dir, vec![sessions.clone()], move || {
        n2.fetch_add(1, Ordering::SeqCst);
    })
    .unwrap();
    sleep(Duration::from_millis(500));
    let step = |label: &str, f: &dyn Fn()| {
        let before = n.load(Ordering::SeqCst);
        f();
        sleep(Duration::from_millis(1800));
        println!("{label:<44} -> {} reload(s)", n.load(Ordering::SeqCst) - before);
    };
    step("edit a tracked file", &|| fs::write(format!("{dir}/a.ts"), "export const a = 2;\n").unwrap());
    step("burst: 20 new files at once", &|| (0..20).for_each(|i| fs::write(format!("{dir}/f{i}.ts"), "x").unwrap()));
    step("ignored file (node_modules/)", &|| {
        fs::create_dir_all(format!("{dir}/node_modules/p")).unwrap();
        fs::write(format!("{dir}/node_modules/p/i.js"), "x").unwrap()
    });
    step("stage files (git add, index only)", &|| git(&dir, &["add", "a.ts"]));
    step("commit", &|| git(&dir, &["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "two"]));
    let cwd = serde_json::to_string(&dir).unwrap();
    step("session file that worked in this repo", &|| fs::write(format!("{sessions}/s1.jsonl"), format!("{{\"cwd\":{cwd}}}\n")).unwrap());
    step("session file from another folder", &|| fs::write(format!("{sessions}/s2.jsonl"), "{\"cwd\":\"/elsewhere\"}\n").unwrap());
    step("non-session file in the sessions folder", &|| fs::write(format!("{sessions}/notes.txt"), "x").unwrap());
}
