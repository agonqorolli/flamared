//! The Changes screen's content: the groups sorted into its sections, each file with its counts, its links to
//! other changed files and the agent's words about it.
use super::model::{FileInfo, GroupItem, LooseFolder, Story, SupportKind};
use super::timeline::Words;
use crate::data::group::{Group, Grouping};
use crate::data::paths::{basename, dirname};
use indexmap::IndexMap;
use std::cmp::Reverse;
use std::collections::{HashMap, HashSet};

/// How many of a group's symbols the window is sent; the rest are counted.
const MAX_SYMBOLS: usize = 12;

/// What is known about each changed file.
pub struct Files<'a> {
    pub grouping: &'a Grouping,
    /// path -> (lines added, lines removed), with the files git doesn't track yet counted too
    pub stats: &'a HashMap<String, (u64, u64)>,
    pub binary: &'a HashSet<&'a String>,
    /// path -> the agent's message before its latest edit of it
    pub words: &'a HashMap<String, Words>,
    /// changed file -> the changed files it imports
    imports: HashMap<&'a String, Vec<&'a String>>,
}

impl<'a> Files<'a> {
    pub fn new(
        grouping: &'a Grouping,
        stats: &'a HashMap<String, (u64, u64)>,
        binary: &'a HashSet<&'a String>,
        words: &'a HashMap<String, Words>,
    ) -> Files<'a> {
        let mut imports: HashMap<&String, Vec<&String>> = HashMap::new();
        for (target, importers) in &grouping.importers {
            for importer in importers {
                imports.entry(importer).or_default().push(target);
            }
        }
        Files {
            grouping,
            stats,
            binary,
            words,
            imports,
        }
    }

    pub fn stat(&self, path: &str) -> (u64, u64) {
        self.stats.get(path).copied().unwrap_or((0, 0))
    }

    fn info(&self, path: &String) -> FileInfo {
        let status = self
            .grouping
            .files
            .get(path)
            .or_else(|| self.grouping.left_out.get(path));
        let (add, rem) = self.stat(path);
        let words = self.words.get(path);
        let mut links_out: Vec<String> = self
            .imports
            .get(path)
            .into_iter()
            .flatten()
            .map(|file| file.to_string())
            .collect();
        links_out.sort();
        let links_in = self.grouping.importers.get(path).cloned().unwrap_or_default();
        FileInfo {
            path: path.clone(),
            status: status.map_or("M", |status| status.as_str()).to_string(),
            add,
            rem,
            words: words.map(|words| words.text.clone()),
            words_agent: words.map(|words| words.agent.clone()),
            words_at: words.map(|words| words.at.clone()),
            links_out,
            links_in,
            binary: self.binary.contains(path),
        }
    }

    fn group_item(&self, group: &Group) -> GroupItem {
        // Added symbols first, then changed, then removed.
        let mut symbols: Vec<(&String, &(char, String))> = group.symbols.iter().collect();
        symbols.sort_by_key(|(_, (kind, _))| "+~-".find(*kind));
        // The agent's latest words about any of the group's files.
        let words = group
            .files
            .iter()
            .chain(&group.tests)
            .filter_map(|path| self.words.get(path))
            .max();
        GroupItem {
            name: group.name.clone(),
            files: group.files.iter().map(|path| self.info(path)).collect(),
            tests: group.tests.iter().map(|path| self.info(path)).collect(),
            symbols: symbols
                .iter()
                .take(MAX_SYMBOLS)
                .map(|(name, (kind, file))| (name.to_string(), kind.to_string(), basename(file).to_string()))
                .collect(),
            more: group.symbols.len().saturating_sub(MAX_SYMBOLS),
            add: group.add,
            rem: group.rem,
            uses: group.uses.clone(),
            used_by: group.used_by,
            imports: group.imports,
            words: words.map(|words| words.text.clone()),
            words_agent: words.map(|words| words.agent.clone()),
        }
    }
}

pub fn story(files: &Files) -> Story {
    let grouping = files.grouping;
    let (mut logic, mut shared, mut wiring) = (vec![], vec![], vec![]);
    let mut loose: IndexMap<String, Vec<GroupItem>> = IndexMap::new();
    for group in &grouping.groups {
        let item = files.group_item(group);
        if group.shared {
            shared.push(item);
        } else if group.registry {
            wiring.push(item);
        } else if group.files.len() > 1 {
            logic.push(item);
        } else {
            // A file connected to nothing: listed with the others of its folder.
            let folder = dirname(&group.files[0]);
            loose
                .entry(if folder.is_empty() {
                    ".".into()
                } else {
                    folder.to_string()
                })
                .or_default()
                .push(item);
        }
    }
    let mut loose: Vec<LooseFolder> = loose
        .into_iter()
        .map(|(folder, files)| LooseFolder { folder, files })
        .collect();
    loose.sort_by_key(|folder| Reverse(folder.files.len())); // stable: ties keep group order
    let support = grouping
        .support
        .iter()
        .map(|(kind, paths)| SupportKind {
            kind: kind.clone(),
            files: paths.iter().map(|path| files.info(path)).collect(),
        })
        .filter(|kind| !kind.files.is_empty())
        .collect();
    let loose_tests = grouping.loose_tests.iter().map(|path| files.info(path)).collect();
    let left_out = grouping.left_out.keys().map(|path| files.info(path)).collect();
    Story {
        logic,
        shared,
        wiring,
        loose,
        support,
        loose_tests,
        left_out,
    }
}
