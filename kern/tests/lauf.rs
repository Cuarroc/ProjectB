use projectb_kern::{lies_claude, Anbieter, Ereignis, Lauf};
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
}
