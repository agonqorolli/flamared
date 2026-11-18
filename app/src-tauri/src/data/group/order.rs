//! The order a group's files are read in: each file after the files of the group it imports, so types and the
//! code they build on come before the code that uses them. Tests follow their source file.
use std::collections::{BTreeSet, HashMap};

/// `files` with each one after the files of the group it imports; files that are free to go next go by name.
/// Files that import each other in a circle can't all follow the rest, so the one waiting on the fewest goes first.
pub fn reading_order(files: &[String], imports: &HashMap<String, BTreeSet<String>>) -> Vec<String> {
    let in_group: BTreeSet<&String> = files.iter().collect();
    // file -> the files of the group it imports that aren't placed yet
    let mut waiting_on: HashMap<&String, BTreeSet<&String>> = files
        .iter()
        .map(|file| {
            let imported = imports.get(file).into_iter().flatten();
            (file, imported.filter(|target| in_group.contains(target)).collect())
        })
        .collect();
    let mut order = Vec::with_capacity(files.len());
    while !waiting_on.is_empty() {
        let next = *waiting_on
            .iter()
            .min_by_key(|(file, waiting)| (waiting.len(), **file))
            .expect("files are left")
            .0;
        waiting_on.remove(next);
        for waiting in waiting_on.values_mut() {
            waiting.remove(next);
        }
        order.push(next.clone());
    }
    order
}

/// `tests` in the order of the files they test (by stem), then by name for those whose file isn't in the group.
pub fn tests_in_order(tests: &[String], files: &[String], stem: impl Fn(&str) -> String) -> Vec<String> {
    let position = |test: &String| {
        let test_stem = stem(test);
        files
            .iter()
            .position(|file| stem(file) == test_stem)
            .unwrap_or(files.len())
    };
    let mut sorted = tests.to_vec();
    sorted.sort_by_cached_key(|test| (position(test), test.clone()));
    sorted
}

#[cfg(test)]
mod tests {
    use super::*;

    fn imports(pairs: &[(&str, &str)]) -> HashMap<String, BTreeSet<String>> {
        let mut map: HashMap<String, BTreeSet<String>> = HashMap::new();
        for (importer, target) in pairs {
            map.entry(importer.to_string()).or_default().insert(target.to_string());
        }
        map
    }

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|name| name.to_string()).collect()
    }

    #[test]
    fn imported_files_come_first() {
        // view imports api and types; api imports types
        let links = imports(&[("view.ts", "api.ts"), ("view.ts", "types.ts"), ("api.ts", "types.ts")]);
        let order = reading_order(&names(&["api.ts", "types.ts", "view.ts"]), &links);
        assert_eq!(order, names(&["types.ts", "api.ts", "view.ts"]));
    }

    #[test]
    fn free_files_go_by_name() {
        let links = imports(&[("b.ts", "z.ts"), ("a.ts", "z.ts")]);
        let order = reading_order(&names(&["b.ts", "a.ts", "z.ts"]), &links);
        assert_eq!(order, names(&["z.ts", "a.ts", "b.ts"]));
    }

    #[test]
    fn imports_outside_the_group_are_ignored() {
        let links = imports(&[("a.ts", "elsewhere.ts")]);
        let order = reading_order(&names(&["b.ts", "a.ts"]), &links);
        assert_eq!(order, names(&["a.ts", "b.ts"]));
    }

    #[test]
    fn a_circle_still_places_every_file() {
        // a and b import each other; c imports a
        let links = imports(&[("a.ts", "b.ts"), ("b.ts", "a.ts"), ("c.ts", "a.ts")]);
        let order = reading_order(&names(&["c.ts", "b.ts", "a.ts"]), &links);
        assert_eq!(order, names(&["a.ts", "b.ts", "c.ts"]));
    }

    #[test]
    fn tests_follow_their_files() {
        let stem = |path: &str| path.split('.').next().unwrap_or(path).to_string();
        let tests = names(&["api.test.ts", "orphan.test.ts", "types.test.ts"]);
        let sorted = tests_in_order(&tests, &names(&["types.ts", "api.ts"]), stem);
        assert_eq!(sorted, names(&["types.test.ts", "api.test.ts", "orphan.test.ts"]));
    }
}
