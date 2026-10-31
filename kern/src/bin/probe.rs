//! Technik-Probe (Schritt 3). Im Ordner C:\ProjectB\kern:
//!   cargo run --bin probe -- beide "Fasse README.md in einem Satz zusammen" --ordner C:\ProjectB --stopp-nach 30
//!   cargo run --bin probe -- claude "Fasse README.md in einem Satz zusammen" --ordner C:\ProjectB
//!   cargo run --bin probe -- codex "Fasse README.md in einem Satz zusammen" --ordner C:\ProjectB

use projectb_kern::{anbieter, Anbieter, Ereignis, Lauf, CLAUDE, CODEX};
use std::path::Path;
use std::sync::mpsc::TryRecvError;
use std::time::{Duration, Instant};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let auswahl = match args.first().map(String::as_str) {
        Some("beide") => vec![&CLAUDE, &CODEX],
        Some(name) => anbieter(name).into_iter().collect(),
        None => vec![],
    };
    let mut ordner = std::env::current_dir().ok();
    let mut stopp = None;
    let mut gueltig = !auswahl.is_empty() && args.get(1).is_some_and(|a| !a.is_empty());
    for paar in args.get(2..).unwrap_or_default().chunks(2) {
        match paar {
            [flag, wert] if flag == "--ordner" => ordner = Some(wert.into()),
            [flag, wert] if flag == "--stopp-nach" => match wert.parse() {
                Ok(sekunden) => stopp = Some(Duration::from_secs(sekunden)),
                Err(_) => gueltig = false,
            },
            _ => gueltig = false,
        }
    }
    if !gueltig || ordner.is_none() {
        eprintln!("Aufruf: probe <beide|claude|codex> \"<Auftrag>\" [--ordner PFAD] [--stopp-nach SEKUNDEN]");
        std::process::exit(1);
    }
    let code = ausfuehren(&auswahl, &args[1], &ordner.unwrap(), stopp, |zeile| println!("{zeile}"));
    std::process::exit(code);
}

/// Austauschbare Anbieter erlauben dieselbe Probe mit lokalen Test-Agenten.
pub fn ausfuehren(
    anbieter: &[&Anbieter],
    auftrag: &str,
    ordner: &Path,
    stopp: Option<Duration>,
    mut ausgabe: impl FnMut(&str),
) -> i32 {
    let start = Instant::now();
    let mut zeile = |name: &str, text: &str| {
        // Auch mehrzeilige Agentenmeldungen behalten Zeit und Namen auf jeder Zeile.
        for teil in text.lines() {
            ausgabe(&format!("[{:>5.1}s] {name:<7} {teil}", start.elapsed().as_secs_f32()));
        }
    };
    let mut laeufe = Vec::new();
    let mut fehler = false;
    // Alle starten, bevor auf irgendeinen Abschluss gewartet wird.
    for a in anbieter {
        match Lauf::starten(a, auftrag, ordner) {
            Ok(lauf) => {
                zeile(a.name, &format!("gestartet in {} (PID {})", ordner.display(), lauf.pid()));
                laeufe.push((a.name, lauf, false, None));
            }
            Err(e) => {
                fehler = true;
                zeile(a.name, &format!("Problem: Start fehlgeschlagen: {e}, Exit-Code nicht verfügbar"));
            }
        }
    }
    while !laeufe.is_empty() {
        let mut gelesen = false;
        let mut index = 0;
        while index < laeufe.len() {
            let (name, lauf, angehalten, problem) = &mut laeufe[index];
            match lauf.ereignisse.try_recv() {
                Ok(e) => {
                    gelesen = true;
                    if let Ereignis::Fertig { erfolg: false, zusammenfassung } = &e {
                        *problem = Some(zusammenfassung.clone());
                    }
                    zeile(name, &e.to_string());
                }
                Err(TryRecvError::Disconnected) => {
                    let (name, mut lauf, angehalten, mut problem) = laeufe.swap_remove(index);
                    let code = match lauf.warten() {
                        Ok(status) => {
                            if !status.success() && !angehalten && problem.is_none() {
                                problem = Some("Agent mit Fehler beendet".into());
                            }
                            status.code().map_or_else(|| "nicht verfügbar".into(), |c| c.to_string())
                        }
                        Err(e) => {
                            problem = Some(format!("Ende nicht feststellbar: {e}"));
                            "nicht verfügbar".into()
                        }
                    };
                    let ergebnis = if let Some(p) = problem {
                        fehler = true;
                        format!("Problem: {}", p.replace(['\r', '\n'], " "))
                    } else if angehalten {
                        "angehalten".into()
                    } else {
                        "fertig".into()
                    };
                    zeile(name, &format!("{ergebnis}, Exit-Code {code}"));
                    continue;
                }
                Err(TryRecvError::Empty) => {}
            }
            if !*angehalten && stopp.is_some_and(|d| start.elapsed() >= d) {
                match lauf.anhalten() {
                    Ok(()) => *angehalten = true,
                    Err(e) => {
                        *problem = Some(format!("Anhalten fehlgeschlagen: {e}"));
                        // Nicht in jeder Runde erneut versuchen.
                        *angehalten = true;
                    }
                }
            }
            index += 1;
        }
        if !gelesen && !laeufe.is_empty() {
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    i32::from(fehler)
}
