//! Nur für Tests: verhält sich wie `claude -p --output-format stream-json`.
use std::io::{Read, Write};
use std::process::{Command, Stdio};

fn main() {
    let hat = |flag: &str| std::env::args().any(|a| a == flag);
    let ich = std::env::current_exe().expect("exe");
    if hat("--schlafen") {
        std::thread::sleep(std::time::Duration::from_secs(60));
        return;
    }
    if hat("--zwischen") {
        // Startet einen Enkel, der die Ausgabe erbt, und endet sofort: der Enkel ist verwaist
        // und hängt nicht mehr im Prozessbaum (wie der `git clone`, den Codex nebenbei startet).
        #[allow(clippy::zombie_processes)] // gewollt: der Enkel soll verwaisen
        let enkel = Command::new(ich).arg("--schlafen").stdin(Stdio::null()).spawn().expect("Enkel");
        let text = format!("enkel {}", enkel.id());
        println!("{}", serde_json::json!({"type":"assistant","message":{"content":[{"type":"text","text":text}]}}));
        return;
    }
    let mut aus = std::io::stdout();
    if hat("--erst-ausgabe") {
        // Schreibt mehr, als eine Pipe puffert, bevor der Auftrag gelesen wird.
        for _ in 0..4096 {
            writeln!(aus, "{}", "x".repeat(63)).unwrap();
        }
    }
    let mut auftrag = String::new();
    std::io::stdin().read_to_string(&mut auftrag).expect("stdin");
    let antwort = serde_json::json!({"type":"assistant","message":{"content":[
        {"type":"text","text":format!("Auftrag: {}", auftrag.trim())},{"type":"tool_use","name":"Read"}]}});
    writeln!(aus, r#"{{"type":"system","subtype":"init","model":"test-modell"}}"#).unwrap();
    writeln!(aus, "{antwort}").unwrap();
    aus.flush().unwrap();
    eprintln!("eine Meldung");
    if hat("--enkel") {
        assert!(Command::new(ich).arg("--zwischen").stdin(Stdio::null()).status().expect("zwischen").success());
    }
    if hat("--haengen") {
        std::thread::sleep(std::time::Duration::from_secs(60));
    }
    writeln!(aus, r#"{{"type":"result","is_error":false,"result":"erledigt"}}"#).unwrap();
}
