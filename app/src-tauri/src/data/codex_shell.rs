//! Conservative evidence of shell writes when Codex did not save a FileChange.
//! Never execute recorded code or reconstruct a historical diff from today's file.
use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;

static PYTHON: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"^python(?:3)?\s+-\s+<<\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?\s*$"#).unwrap());

/// Only a directly invoked Python heredoc is understood. Other shell programs, dynamic paths,
/// control flow and failed commands are deliberately left out rather than guessed at.
pub fn written_paths(cmd: &str, output: &str, exit: Option<i64>) -> Vec<String> {
    if exit != Some(0) || output.contains("Traceback (most recent call last)") || output.contains("SyntaxError:") {
        return vec![];
    }
    let mut lines = cmd.lines();
    let Some(header) = lines.next().and_then(|l| PYTHON.captures(l.trim())) else { return vec![] };
    let mut body = String::new();
    let mut closed = false;
    for line in lines {
        if line == &header[1] {
            closed = true;
            break;
        }
        body.push_str(line);
        body.push('\n');
    }
    if !closed { return vec![]; }
    python_writes(&body)
}

#[derive(Debug, PartialEq)]
enum Token {
    Name(String),
    Text(String),
    Punct(char),
}

// Tokenize first so strings containing example code cannot be mistaken for executed statements.
// Preserve indentation and brackets: only simple top-level statements are recognized below.
fn statements(code: &str) -> Vec<Vec<Token>> {
    let chars: Vec<char> = code.chars().collect();
    let (mut i, mut depth, mut start, mut indented) = (0, 0usize, true, false);
    let (mut out, mut stmt) = (Vec::new(), Vec::new());
    while i < chars.len() {
        let c = chars[i];
        if start && matches!(c, ' ' | '\t') { indented = true; }
        if c == '#' {
            while i < chars.len() && chars[i] != '\n' { i += 1; }
            continue;
        }
        if (c == '\n' || c == ';') && depth == 0 {
            if !indented && !stmt.is_empty() { out.push(std::mem::take(&mut stmt)); }
            stmt.clear();
            if c == '\n' { start = true; indented = false; }
            i += 1;
            continue;
        }
        if c.is_whitespace() { i += 1; continue; }
        start = false;
        if matches!(c, '\'' | '"') {
            let triple = chars.get(i + 1) == Some(&c) && chars.get(i + 2) == Some(&c);
            let width = if triple { 3 } else { 1 };
            i += width;
            let mut text = String::new();
            let mut closed = false;
            while i < chars.len() {
                if chars[i] == c && (!triple || (chars.get(i + 1) == Some(&c) && chars.get(i + 2) == Some(&c))) {
                    i += width;
                    closed = true;
                    break;
                }
                if chars[i] == '\\' {
                    i += 1;
                    if i >= chars.len() { break; }
                    // Unknown escape sequences cannot form a literal path.
                    match chars[i] { '\\' | '\'' | '"' => text.push(chars[i]), _ => text.push('\0') }
                } else { text.push(chars[i]); }
                i += 1;
            }
            if !closed { return vec![]; }
            stmt.push(Token::Text(text));
        } else if c.is_alphabetic() || c == '_' {
            let from = i;
            while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') { i += 1; }
            stmt.push(Token::Name(chars[from..i].iter().collect()));
        } else {
            if matches!(c, '(' | '[' | '{') { depth += 1; }
            if matches!(c, ')' | ']' | '}') { depth = depth.saturating_sub(1); }
            stmt.push(Token::Punct(c));
            i += 1;
        }
    }
    if depth == 0 && !indented && !stmt.is_empty() { out.push(stmt); }
    out
}

fn literal(tokens: &[Token], vars: &HashMap<String, String>) -> Option<String> {
    match tokens {
        [Token::Text(s)] if !s.is_empty() && !s.contains(['\0', '\n', '\r']) => Some(s.clone()),
        [Token::Name(n)] => vars.get(n).cloned(),
        [Token::Name(n), Token::Punct('('), arg, Token::Punct(')')] if n == "Path" => literal(std::slice::from_ref(arg), vars),
        _ => None,
    }
}

fn python_writes(code: &str) -> Vec<String> {
    let (mut vars, mut out) = (HashMap::new(), Vec::new());
    for stmt in statements(code) {
        // We do not interpret Python control flow or changes to the process's working folder.
        if stmt.iter().any(|t| matches!(t, Token::Name(n) if matches!(n.as_str(), "if" | "for" | "while" | "try" | "with" | "def" | "class" | "match" | "raise" | "exit" | "quit")))
            || stmt.windows(2).any(|w| matches!(w, [Token::Name(n), Token::Punct('(')] if matches!(n.as_str(), "chdir" | "exit" | "exec" | "eval"))) {
            return vec![];
        }
        if let [Token::Name(name), Token::Punct(op), Token::Punct('='), ..] = stmt.as_slice() {
            if matches!(op, '+' | '-' | '*' | '/' | '%' | '|' | '&' | '^') { vars.remove(name); }
        }
        if let [Token::Name(name), Token::Punct('='), rhs @ ..] = stmt.as_slice() {
            if name == "open" || name == "Path" { return vec![]; }
            let value = literal(rhs, &vars);
            vars.remove(name);
            if let Some(value) = value { vars.insert(name.clone(), value); }
            continue;
        }
        // open(path, 'w').write(...) / append / exclusive creation, with optional binary mode.
        let path = match stmt.as_slice() {
            [Token::Name(open), Token::Punct('('), path, Token::Punct(','), Token::Text(mode), Token::Punct(')'), Token::Punct('.'), Token::Name(write), Token::Punct('('), ..]
                if open == "open" && write == "write" && matches!(mode.as_str(), "w" | "wb" | "a" | "ab" | "x" | "xb") => literal(std::slice::from_ref(path), &vars),
            // Path('file').write_text(...) / p.write_text(...) where p is a known literal Path.
            _ => stmt.windows(3).position(|w| matches!(w, [Token::Punct('.'), Token::Name(n), Token::Punct('(')] if n == "write_text" || n == "write_bytes"))
                .and_then(|i| literal(&stmt[..i], &vars)),
        };
        if let Some(path) = path {
            if !out.contains(&path) { out.push(path); }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn literal_python_writes_not_reads_or_embedded_examples() {
        let cmd = "python3 - <<'PY'\np='src/a.ts';s=open(p).read();s=s.replace('before','after');open(p,'w').write(s)\np='src/b.ts';open(p,'w').write(s)\nexample=\"\"\"open('fake.ts','w').write('x')\"\"\"\n# open('comment.ts','w').write(s)\nprint(\"open('printed.ts','w').write('x')\")\nPath('src/c.ts').write_text(s)\nPY";
        assert_eq!(written_paths(cmd, "", Some(0)), ["src/a.ts", "src/b.ts", "src/c.ts"]);
        assert!(written_paths(cmd, "", Some(1)).is_empty());
        assert!(written_paths(cmd, "Traceback (most recent call last)", Some(0)).is_empty());
        assert!(written_paths(cmd, "", None).is_empty());
    }

    #[test]
    fn dynamic_paths_and_unexecuted_blocks_are_not_attributed() {
        let cmd = "python - <<'PY'\np='old.ts'\np=get_path()\nopen(p,'w').write('x')\nif False:\n  open('conditional.ts','w').write('x');open('also.ts','w').write('x')\ndef unused():\n  open('function.ts','w').write('x')\nPY";
        assert!(written_paths(cmd, "", Some(0)).is_empty());
        assert!(written_paths("cat <<'PY'\nopen('example.ts','w').write('x')\nPY", "", Some(0)).is_empty());
        assert!(written_paths("python - <<'PY'\nopen('conditional.ts','w').write('x') if False else None\nPY", "", Some(0)).is_empty());
        assert!(written_paths("python - <<'PY'\np='old';p += suffix;open(p,'w').write('x')\nPY", "", Some(0)).is_empty());
    }
}
