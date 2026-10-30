//! Technik-Probe (Schritt 3). Beispiel unter Windows, im Ordner C:\ProjectB\kern:
//!   cargo run --bin probe -- claude "Fasse README.md in einem Satz zusammen" --ordner C:\ProjectB
//!   cargo run --bin probe -- codex "Fasse README.md in einem Satz zusammen" --ordner C:\ProjectB
//!   cargo run --bin probe -- claude "Zähle langsam bis 100" --stopp-nach 10

use projectb_kern::{anbieter, Lauf};
use std::sync::mpsc::RecvTimeoutError;
use std::time::{Duration, Instant};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let wert = |flag: &str| args.iter().position(|a| a == flag).and_then(|i| args.get(i + 1));
    let (Some(a), Some(auftrag)) = (args.first().and_then(|n| anbieter(n)), args.get(1)) else {
        eprintln!("Aufruf: probe <claude|codex> \"<Auftrag>\" [--ordner PFAD] [--stopp-nach SEKUNDEN]");
        std::process::exit(2);
    };
    let ordner = wert("--ordner").map(Into::into).unwrap_or_else(|| std::env::current_dir().expect("Ordner"));
    let stopp = wert("--stopp-nach").and_then(|s| s.parse().ok()).map(Duration::from_secs);
    let start = Instant::now();
    let zeit = || format!("[{:>5.1}s]", start.elapsed().as_secs_f32());
    let mut lauf = Lauf::starten(a, auftrag, &ordner).unwrap_or_else(|e| {
        eprintln!("Start von {} fehlgeschlagen: {e}", a.name);
        std::process::exit(1);
    });
    println!("{} {} gestartet in {}", zeit(), a.name, ordner.display());
    let mut angehalten = false;
    loop {
        match lauf.ereignisse.recv_timeout(Duration::from_millis(200)) {
            Ok(e) => println!("{} {e}", zeit()),
            Err(RecvTimeoutError::Disconnected) => break,
            Err(RecvTimeoutError::Timeout) => {}
        }
        if !angehalten && stopp.is_some_and(|d| start.elapsed() >= d) {
            lauf.anhalten().expect("anhalten");
            angehalten = true;
            println!("{} ANGEHALTEN", zeit());
        }
    }
    let status = lauf.warten().expect("warten");
    println!("{} beendet, Exit-Code {:?}", zeit(), status.code());
    std::process::exit(if angehalten || status.success() { 0 } else { 1 });
}
