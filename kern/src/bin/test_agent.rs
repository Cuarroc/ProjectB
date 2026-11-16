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
    if hat("--ohne-lesen") {
        return; // endet, ohne den Auftrag zu lesen: das Schreiben des Auftrags scheitert
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
    if hat("--datei-ohne-ereignis") {
        std::fs::write("still.txt", "eins\nzwei\n").unwrap();
        let frist = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while !std::path::Path::new(auftrag.trim()).is_file() {
            assert!(std::time::Instant::now() < frist, "Datei wurde nicht live gemeldet");
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }
    let text = if hat("--argumente") {
        std::env::args().skip(1).collect::<Vec<_>>().join(" ")
    } else {
        format!("Auftrag: {}", auftrag.trim())
    };
    let antwort = serde_json::json!({"type":"assistant","message":{"content":[
        {"type":"text","text":text},{"type":"tool_use","name":"Read"}]}});
    if hat("--codex") {
        writeln!(aus, r#"{{"type":"thread.started","thread_id":"test-sitzung"}}"#).unwrap();
    } else {
        writeln!(aus, r#"{{"type":"system","subtype":"init","model":"test-modell","session_id":"test-sitzung"}}"#)
            .unwrap();
    }
    if hat("--kaputtes-utf8") {
        aus.write_all(b"kaputt \xff\n").unwrap();
    }
    if hat("--kein-json") {
        writeln!(aus, "  einfache Ausgabe  \n  ").unwrap();
    }
    if hat("--kontingent") {
        // Claude-Format vom 15.11.; das Fenster liegt für zeitunabhängige Tests in der Zukunft.
        writeln!(
            aus,
            "{}",
            serde_json::json!({"type":"rate_limit_event", "rate_limit_info":{
                "status":"allowed", "resetsAt":1794736200, "rateLimitType":"five_hour",
                "overageStatus":"rejected", "overageDisabledReason":"out_of_credits", "isUsingOverage":false,
                "unifiedWindows":{
                    "five_hour":{"utilization":0.15,"resetsAt":1794736200,"status":"allowed"},
                    "seven_day":{"utilization":0.08,"resetsAt":4_000_000_000u64,"status":"allowed"}}
            }})
        )
        .unwrap();
    }
    if hat("--codex") {
        writeln!(aus, "{}", serde_json::json!({"type":"item.completed","item":{"type":"agent_message","text":text}}))
            .unwrap();
        if hat("--wiederverbindung") {
            writeln!(aus, r#"{{"type":"error","message":"Reconnecting… 1/5"}}"#).unwrap();
        }
        if hat("--turn-failed") {
            writeln!(aus, r#"{{"type":"turn.failed","error":{{"message":"Verbindung verloren"}}}}"#).unwrap();
        } else {
            writeln!(aus, r#"{{"type":"turn.completed"}}"#).unwrap();
        }
        if hat("--haengen") {
            aus.flush().unwrap();
            std::thread::sleep(std::time::Duration::from_secs(60));
        }
        if hat("--exit-1") {
            std::process::exit(1);
        }
        if hat("--exit-3") {
            std::process::exit(3);
        }
        return;
    }
    writeln!(aus, "{antwort}").unwrap();
    aus.flush().unwrap();
    if hat("--chat-live") {
        let frist = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while !std::path::Path::new(auftrag.trim()).is_file() {
            assert!(std::time::Instant::now() < frist, "Chat-Text kam nicht live an");
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        writeln!(
            aus,
            "{}",
            serde_json::json!({"type":"assistant","message":{"content":[
            {"type":"text","text":"Antwort bestätigt"}]}})
        )
        .unwrap();
    }
    eprintln!("eine Meldung");
    if hat("--enkel") {
        assert!(Command::new(ich).arg("--zwischen").stdin(Stdio::null()).status().expect("zwischen").success());
    }
    if hat("--haengen") {
        std::thread::sleep(std::time::Duration::from_secs(60));
    }
    if hat("--fehler") {
        std::process::exit(7);
    }
    writeln!(aus, r#"{{"type":"result","subtype":"success","is_error":false,"result":"erledigt"}}"#).unwrap();
}
