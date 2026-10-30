//! Nur für Tests: verhält sich wie `claude -p --output-format stream-json`.
use std::io::{Read, Write};

fn main() {
    let mut auftrag = String::new();
    std::io::stdin().read_to_string(&mut auftrag).expect("stdin");
    let mut aus = std::io::stdout();
    let antwort = serde_json::json!({"type":"assistant","message":{"content":[
        {"type":"text","text":format!("Auftrag: {}", auftrag.trim())},{"type":"tool_use","name":"Read"}]}});
    writeln!(aus, r#"{{"type":"system","subtype":"init","model":"test-modell"}}"#).unwrap();
    writeln!(aus, "{antwort}").unwrap();
    aus.flush().unwrap();
    eprintln!("eine Meldung");
    if std::env::args().any(|a| a == "--haengen") {
        std::thread::sleep(std::time::Duration::from_secs(60));
    }
    writeln!(aus, r#"{{"type":"result","is_error":false,"result":"erledigt"}}"#).unwrap();
}
