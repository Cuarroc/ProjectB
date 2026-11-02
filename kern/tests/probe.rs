#[allow(dead_code)]
#[path = "../src/bin/probe.rs"]
mod probe;

use projectb_kern::{lies_claude, lies_codex, Anbieter, Ereignis};
use std::time::{Duration, Instant};

fn agent(name: &'static str, argumente: &'static [&'static str]) -> Anbieter {
    Anbieter { name, programm: env!("CARGO_BIN_EXE_test_agent"), argumente, lesen: lies_claude }
}

fn pruefen(argumente: &'static [&'static str], stopp: Option<Duration>, erwartet: i32, ende: &str) {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let start = Instant::now();
        let mut zeilen = Vec::new();
        let code = probe::ausfuehren(
            &[&agent("claude", argumente), &agent("codex", argumente)],
            "derselbe Auftrag",
            &std::env::temp_dir(),
            stopp,
            |z| zeilen.push(z.to_owned()),
        );
        tx.send((code, zeilen, start.elapsed())).unwrap();
    });
    let (code, zeilen, dauer) = rx.recv_timeout(Duration::from_secs(15)).expect("Probe hängt");
    assert_eq!(code, erwartet, "{zeilen:?}");
    assert!(dauer < Duration::from_secs(10));
    for name in ["claude", "codex"] {
        let eigene: Vec<_> = zeilen.iter().filter(|z| z.contains(name)).collect();
        assert!(eigene.iter().any(|z| z.contains("bereit (Modell:")), "{zeilen:?}");
        assert!(eigene.iter().any(|z| z.contains("sagt: Auftrag: derselbe Auftrag")), "{zeilen:?}");
        assert!(eigene.last().unwrap().contains(ende), "{zeilen:?}");
    }
    let erster_abschluss = zeilen.iter().position(|z| z.contains("Exit-Code")).unwrap();
    for name in ["claude", "codex"] {
        assert!(zeilen[..erster_abschluss].iter().any(|z| z.contains(name) && z.contains("gestartet")));
    }
    assert!(zeilen
        .iter()
        .all(|z| { z.starts_with('[') && z.contains("s] ") && (z.contains("claude ") || z.contains("codex ")) }));
}

#[test]
fn beide_werden_fertig() {
    pruefen(&[], None, 0, "fertig, Exit-Code 0");
}

#[test]
fn anhalten_beendet_beide_gleichzeitigen_laeufe() {
    pruefen(&["--haengen"], Some(Duration::from_secs(2)), 0, "angehalten, Exit-Code");
}

#[test]
fn fehler_exitcode_ergibt_eins() {
    pruefen(&["--fehler"], None, 1, "Problem: Agent mit Fehler beendet, Exit-Code 7");
}

#[test]
fn kern_ergebnis_bestimmt_den_abschluss() {
    for (argumente, erwartet, ende) in [
        (&["--ohne-lesen"][..], 1, "Problem: Agent mit Fehler beendet, Exit-Code 0"),
        (&["--codex", "--wiederverbindung"][..], 0, "fertig, Exit-Code 0"),
        (&["--codex", "--exit-3"][..], 1, "Problem: Agent mit Fehler beendet, Exit-Code 3"),
        (&["--codex", "--wiederverbindung", "--turn-failed"][..], 1, "Problem: Verbindung verloren, Exit-Code 0"),
    ] {
        let codex = Anbieter { lesen: lies_codex, ..agent("codex", argumente) };
        let mut zeilen = Vec::new();
        let code = probe::ausfuehren(&[&codex], "x", &std::env::temp_dir(), None, |z| zeilen.push(z.to_owned()));
        assert_eq!(code, erwartet, "{zeilen:?}");
        assert!(zeilen.last().unwrap().contains(ende), "{zeilen:?}");
    }
}

#[test]
fn absichtlicher_codex_stopp_bleibt_erfolgreich() {
    let codex = Anbieter { lesen: lies_codex, ..agent("codex", &["--codex", "--haengen"]) };
    let mut zeilen = Vec::new();
    let code = probe::ausfuehren(&[&codex], "x", &std::env::temp_dir(), Some(Duration::from_secs(2)), |z| {
        zeilen.push(z.to_owned());
    });
    assert_eq!(code, 0, "{zeilen:?}");
    assert!(zeilen.last().unwrap().contains("angehalten, Exit-Code"), "{zeilen:?}");
}

#[test]
fn startfehler_verhindert_den_anderen_lauf_nicht() {
    let fehlt = Anbieter { programm: "projectb-nicht-vorhanden", ..agent("claude", &[]) };
    let mut ausgabe = String::new();
    let code = probe::ausfuehren(&[&fehlt, &agent("codex", &[])], "x", &std::env::temp_dir(), None, |z| {
        ausgabe.push_str(z);
        ausgabe.push('\n');
    });
    assert_eq!(code, 1);
    assert!(ausgabe.contains("claude  Problem: Start fehlgeschlagen"));
    assert!(ausgabe.contains("codex   fertig, Exit-Code 0"));
}

#[test]
fn fehlermeldung_bei_exit_null_bleibt_ein_problem() {
    let rot = Anbieter {
        lesen: |_| vec![Ereignis::Fertig { erfolg: false, zusammenfassung: "Kontingent leer\nBitte warten".into() }],
        ..agent("codex", &[])
    };
    let mut zeilen = Vec::new();
    assert_eq!(probe::ausfuehren(&[&rot], "x", &std::env::temp_dir(), None, |z| zeilen.push(z.to_owned())), 1);
    assert!(zeilen.iter().all(|z| z.starts_with('[') && z.contains("s] codex   ")));
    assert!(zeilen.iter().any(|z| z.contains("Exit-Code 0")));
}

#[test]
fn ungueltige_argumente_starten_keinen_agenten() {
    for args in [
        vec![],
        vec!["unbekannt", "x"],
        vec!["beide", "x", "--stopp-nach", "falsch"],
        vec!["codex", "x", "--ordner"],
        vec!["claude", "x", "--unbekannt", "x"],
    ] {
        let ausgabe = std::process::Command::new(env!("CARGO_BIN_EXE_probe")).args(args).output().unwrap();
        assert_eq!(ausgabe.status.code(), Some(1));
        assert!(ausgabe.stdout.is_empty());
        assert!(String::from_utf8_lossy(&ausgabe.stderr).contains("Aufruf: probe"));
    }
}
