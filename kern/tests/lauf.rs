use projectb_kern::{lies_claude, lies_codex, Anbieter, Ereignis, Lauf};
use std::time::{Duration, Instant};

static TEST_AGENT: Anbieter =
    Anbieter { name: "test", programm: env!("CARGO_BIN_EXE_test_agent"), argumente: &[], lesen: lies_claude };
static HAENGT: Anbieter = Anbieter {
    name: "test",
    programm: env!("CARGO_BIN_EXE_test_agent"),
    argumente: &["--haengen"],
    lesen: lies_claude,
};

#[test]
fn liest_alle_ereignisse_live() {
    let mut lauf = Lauf::starten(&TEST_AGENT, "Hallo", &std::env::temp_dir()).unwrap();
    let alle: Vec<Ereignis> = lauf.ereignisse.iter().collect();
    assert!(lauf.warten().unwrap().success());
    // Fehlerausgabe und Ereignisse kommen über zwei Wege; nur die Ereignisse haben eine feste Reihenfolge.
    let erstes = alle.iter().find(|e| !matches!(e, Ereignis::Meldung(_)));
    assert_eq!(erstes, Some(&Ereignis::Gestartet { modell: Some("test-modell".into()) }));
    for erwartet in [
        Ereignis::Text("Auftrag: Hallo".into()),
        Ereignis::Werkzeug("Read".into()),
        Ereignis::Meldung("eine Meldung".into()),
        Ereignis::Fertig { erfolg: true, zusammenfassung: "erledigt".into() },
    ] {
        assert!(alle.contains(&erwartet), "fehlt: {erwartet:?} in {alle:?}");
    }
}

#[test]
fn anhalten_beendet_einen_haengenden_agenten() {
    let mut lauf = Lauf::starten(&HAENGT, "x", &std::env::temp_dir()).unwrap();
    // Erst anhalten, wenn der Agent nachweislich läuft.
    while !matches!(lauf.ereignisse.recv_timeout(Duration::from_secs(20)).unwrap(), Ereignis::Gestartet { .. }) {}
    let t = Instant::now();
    lauf.anhalten().unwrap();
    assert!(t.elapsed() < Duration::from_secs(10));
    assert!(!lauf.warten().unwrap().success());
    let rest: Vec<Ereignis> = lauf.ereignisse.iter().collect();
    assert!(!rest.iter().any(|e| matches!(e, Ereignis::Fertig { .. })), "{rest:?}");
    assert!(matches!(rest.last(), Some(Ereignis::Beendet { erfolg: false, .. })), "{rest:?}");
}

fn agent(argumente: &'static [&'static str]) -> Anbieter {
    Anbieter { name: "test", programm: env!("CARGO_BIN_EXE_test_agent"), argumente, lesen: lies_claude }
}

fn sammeln(anbieter: &Anbieter) -> Vec<Ereignis> {
    let mut lauf = Lauf::starten(anbieter, "x", &std::env::temp_dir()).unwrap();
    let alle = lauf.ereignisse.iter().collect();
    lauf.warten().unwrap();
    alle
}

#[test]
fn ungueltiges_utf8_unterbricht_das_lesen_nicht() {
    let alle = sammeln(&agent(&["--kaputtes-utf8"]));
    assert!(alle.contains(&Ereignis::Meldung("kaputt \u{fffd}".into())), "{alle:?}");
    assert!(alle.contains(&Ereignis::Text("Auftrag: x".into())), "{alle:?}");
}

#[test]
fn einfache_ausgabe_wird_gemeldet_leerzeilen_nicht() {
    let alle = sammeln(&agent(&["--kein-json"]));
    assert!(alle.contains(&Ereignis::Meldung("  einfache Ausgabe  ".into())), "{alle:?}");
    assert!(!alle.contains(&Ereignis::Meldung(String::new())), "{alle:?}");
}

#[test]
fn claude_erfolg_braucht_beide_felder() {
    for (subtype, is_error, erfolg) in
        [("success", false, true), ("error_max_turns", false, false), ("success", true, false)]
    {
        let zeile = serde_json::json!({"type":"result", "subtype":subtype, "is_error":is_error});
        assert!(matches!(&lies_claude(&zeile)[..], [Ereignis::Fertig { erfolg: ist, .. }] if *ist == erfolg));
    }
}

#[test]
fn codex_erfolg_erfordert_exit_code_null() {
    let fertig = serde_json::json!({"type":"turn.completed"});
    assert!(!lies_codex(&fertig).iter().any(|e| matches!(e, Ereignis::Fertig { erfolg: true, .. })));
    let codex = Anbieter { name: "codex", lesen: lies_codex, ..agent(&["--codex", "--exit-3"]) };
    let alle = sammeln(&codex);
    assert!(!alle.iter().any(|e| matches!(e, Ereignis::Fertig { erfolg: true, .. })), "{alle:?}");
    assert_eq!(alle.last().unwrap().to_string(), "PROBLEM: beendet (Exit-Code: 3)");
    let codex = Anbieter { name: "codex", lesen: lies_codex, ..agent(&["--codex"]) };
    let alle = sammeln(&codex);
    assert!(alle.iter().any(|e| matches!(e, Ereignis::Fertig { erfolg: true, .. })), "{alle:?}");
    assert_eq!(alle.last().unwrap().to_string(), "beendet (Exit-Code: 0)");
}

#[test]
fn prozessende_kommt_zuletzt_und_fehlt_keine_ergebnismeldung() {
    let alle = sammeln(&TEST_AGENT);
    assert_eq!(alle.last().unwrap().to_string(), "beendet (Exit-Code: 0)");
    let ohne = sammeln(&agent(&["--ohne-lesen"]));
    assert_eq!(ohne.last().unwrap().to_string(), "PROBLEM: beendet (Exit-Code: 0)");
}

#[test]
fn grosser_auftrag_blockiert_nicht() {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let auftrag = "a".repeat(1 << 20);
        let mut lauf = Lauf::starten(&agent(&["--erst-ausgabe"]), &auftrag, &std::env::temp_dir()).unwrap();
        let gelesen = lauf.ereignisse.iter().any(|e| e == Ereignis::Text(format!("Auftrag: {auftrag}")));
        tx.send(gelesen && lauf.warten().unwrap().success()).unwrap();
    });
    assert!(rx.recv_timeout(Duration::from_secs(30)).expect("Lauf hängt mit großem Auftrag"));
}

#[test]
fn schreibfehler_wird_zur_meldung() {
    // Größer als der Pipe-Puffer: das Schreiben wartet, bis der Agent ohne Lesen endet, und scheitert dann.
    let auftrag = "a".repeat(1 << 20);
    let mut lauf = Lauf::starten(&agent(&["--ohne-lesen"]), &auftrag, &std::env::temp_dir()).unwrap();
    let alle: Vec<Ereignis> = lauf.ereignisse.iter().collect();
    lauf.warten().unwrap();
    let gemeldet =
        alle.iter().any(|e| matches!(e, Ereignis::Meldung(m) if m.starts_with("Auftrag nicht vollständig übergeben")));
    assert!(gemeldet, "{alle:?}");
}

#[cfg(windows)]
mod verwaiste_enkel {
    use super::*;
    use std::sync::mpsc::RecvTimeoutError;

    fn enkel_pid(lauf: &Lauf) -> u32 {
        loop {
            if let Ereignis::Text(t) = lauf.ereignisse.recv_timeout(Duration::from_secs(20)).unwrap() {
                if let Some(pid) = t.strip_prefix("enkel ") {
                    return pid.parse().unwrap();
                }
            }
        }
    }

    /// Wartet bis zu 5 s darauf, dass der Prozess endet.
    fn endet(pid: u32) -> bool {
        use windows_sys::Win32::{Foundation::*, System::Threading::*};
        unsafe {
            let h = OpenProcess(PROCESS_SYNCHRONIZE, 0, pid);
            if h.is_null() {
                return true; // gibt es nicht mehr
            }
            let fertig = WaitForSingleObject(h, 5000) == WAIT_OBJECT_0;
            CloseHandle(h);
            fertig
        }
    }

    #[test]
    fn anhalten_beendet_auch_den_enkel() {
        let mut lauf = Lauf::starten(&agent(&["--enkel", "--haengen"]), "x", &std::env::temp_dir()).unwrap();
        let pid = enkel_pid(&lauf);
        lauf.anhalten().unwrap();
        assert!(endet(pid), "Enkel {pid} lebt noch");
    }

    #[test]
    fn lauf_endet_mit_dem_agenten_samt_enkel() {
        let mut lauf = Lauf::starten(&agent(&["--enkel"]), "x", &std::env::temp_dir()).unwrap();
        let pid = enkel_pid(&lauf);
        let ende = Instant::now() + Duration::from_secs(5);
        loop {
            match lauf.ereignisse.recv_timeout(ende.saturating_duration_since(Instant::now())) {
                Ok(_) => {}
                Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => panic!("Ereignisse 5 s nach dem Ende noch offen"),
            }
        }
        assert!(lauf.warten().unwrap().success());
        assert!(endet(pid), "Enkel {pid} lebt noch");
    }

    /// Der echte Weg von claude/codex: ein `.cmd`-Starter, dahinter cmd.exe und der eigentliche Prozess.
    #[test]
    fn anhalten_ueber_cmd_starter_beendet_den_enkel() {
        let cmd = std::env::temp_dir().join(format!("projectb-test-agent-{}.cmd", std::process::id()));
        std::fs::write(&cmd, format!("@\"{}\" %*\r\n", env!("CARGO_BIN_EXE_test_agent"))).unwrap();
        let ueber_cmd =
            Anbieter { programm: cmd.to_str().unwrap().to_owned().leak(), ..agent(&["--enkel", "--haengen"]) };
        let mut lauf = Lauf::starten(&ueber_cmd, "x", &std::env::temp_dir()).unwrap();
        let pid = enkel_pid(&lauf);
        lauf.anhalten().unwrap();
        let _ = std::fs::remove_file(&cmd);
        assert!(endet(pid), "Enkel {pid} lebt noch");
    }
}
