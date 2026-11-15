use projectb_kern::{
    chat::ausfuehren,
    start::Startwunsch,
    verbrauch::{laden, Stand},
    Anbieter, CLAUDE, CODEX,
};
use std::{fs, path::Path};

fn agent(codex: bool, argumente: &'static [&'static str]) -> Anbieter {
    let basis = if codex { &CODEX } else { &CLAUDE };
    Anbieter { programm: env!("CARGO_BIN_EXE_test_agent"), argumente, ..*basis }
}

fn wunsch() -> Startwunsch {
    Startwunsch { rolle: None, modell: None, effort: None, fortsetzen: None, auftrag: "Hallo".into() }
}

#[test]
fn beide_anbieter_liefern_text_sitzung_und_erfolg() {
    for a in [agent(false, &[]), agent(true, &["--codex"])] {
        let mut texte = Vec::new();
        let antwort = ausfuehren(&a, &wunsch(), Path::new("."), None, |t| texte.push(t)).unwrap();
        assert_eq!(texte, ["Auftrag: Hallo"]);
        assert_eq!(antwort.sitzung.as_deref(), Some("test-sitzung"));
        assert!(antwort.erfolg);
        assert_eq!(antwort.json(), serde_json::json!({"sitzung":"test-sitzung", "erfolg":true}));
    }
}

#[test]
fn fehler_erscheint_im_chat_und_exit_code_entscheidet() {
    for (a, erwartet) in [
        (agent(false, &["--fehler"]), "Exit-Code: 7"),
        (agent(true, &["--codex", "--exit-3"]), "fehlgeschlagen"),
        (agent(true, &["--codex", "--turn-failed"]), "Verbindung verloren"),
    ] {
        let mut texte = Vec::new();
        let antwort = ausfuehren(&a, &wunsch(), Path::new("."), None, |t| texte.push(t)).unwrap();
        assert!(!antwort.erfolg);
        assert_eq!(texte.iter().filter(|t| t.contains("fehlgeschlagen")).count(), 1, "{texte:?}");
        assert!(texte.last().unwrap().contains(erwartet), "{texte:?}");
    }
}

#[test]
fn kontingent_wird_gemerkt_schreibfehler_beendet_lauf_nicht() {
    let ordner = Path::new(env!("CARGO_MANIFEST_DIR")).join("target").join(format!("chat-{}", std::process::id()));
    fs::create_dir_all(&ordner).unwrap();
    let datei = ordner.join("kontingent.json");
    let a = agent(false, &["--kontingent"]);
    for pfad in [&datei, &datei.join("blockiert.json")] {
        assert!(ausfuehren(&a, &wunsch(), &ordner, Some(pfad), |_| {}).unwrap().erfolg);
    }
    assert_eq!(laden(&datei)["claude"], Stand { prozent: 8, endet: 4_000_000_000 });
    fs::remove_dir_all(ordner).unwrap();
}

#[test]
fn letzte_sitzung_gilt_und_folgenachricht_erreicht_den_startweg() {
    for (codex, argumente, schalter) in
        [(false, &["--argumente"][..], "--resume"), (true, &["--codex", "--argumente"][..], "resume")]
    {
        let a = agent(codex, argumente);
        let w = Startwunsch { fortsetzen: Some("test-sitzung".into()), ..wunsch() };
        let mut texte = Vec::new();
        let antwort = ausfuehren(&a, &w, Path::new("."), None, |t| texte.push(t)).unwrap();
        assert!(antwort.erfolg);
        assert!(texte.iter().any(|t| t.contains(&format!("{schalter} test-sitzung"))), "{texte:?}");
    }
    let a = Anbieter {
        lesen: |v| {
            let mut e = projectb_kern::lies_claude(v);
            if v["type"] == "system" {
                e.push(projectb_kern::Ereignis::Sitzung("letzte-sitzung".into()));
            }
            e
        },
        ..agent(false, &[])
    };
    let antwort = ausfuehren(&a, &wunsch(), Path::new("."), None, |_| {}).unwrap();
    assert_eq!(antwort.sitzung.as_deref(), Some("letzte-sitzung"));
}

#[test]
fn startfehler_wird_zurueckgegeben_ohne_ausgabe() {
    let a = Anbieter { programm: "projectb-chat-programm-existiert-nicht", ..agent(false, &[]) };
    let fehler = ausfuehren(&a, &wunsch(), Path::new("."), None, |_| panic!("kein Lauf")).err().unwrap();
    assert_eq!(fehler.kind(), std::io::ErrorKind::NotFound);
}

#[test]
fn text_kommt_vor_prozessende_im_gewaehlten_ordner() {
    let ordner = Path::new(env!("CARGO_MANIFEST_DIR")).join("target").join(format!("chat-live-{}", std::process::id()));
    fs::create_dir_all(&ordner).unwrap();
    let marker = ordner.join("weiter");
    if marker.exists() {
        fs::remove_file(&marker).unwrap();
    }
    let w = Startwunsch { auftrag: "weiter".into(), ..wunsch() };
    let mut bestaetigt = false;
    let antwort = ausfuehren(&agent(false, &["--chat-live"]), &w, &ordner, None, |text| {
        bestaetigt |= text == "Antwort bestätigt";
        fs::write(&marker, "Antwort live angekommen").unwrap();
    })
    .unwrap();
    assert!(antwort.erfolg);
    assert!(bestaetigt);
    fs::remove_dir_all(ordner).unwrap();
}

#[test]
fn ohne_sitzung_bleibt_json_null_und_ohne_ergebnis_keine_erfolgsmeldung() {
    let antwort = ausfuehren(&agent(false, &["--ohne-lesen"]), &wunsch(), Path::new("."), None, |_| {}).unwrap();
    assert_eq!(antwort.json(), serde_json::json!({"sitzung":null, "erfolg":false}));
}

#[test]
fn letzter_gezeigter_text_verhindert_doppelten_fehlertext() {
    let a = Anbieter {
        lesen: |v| {
            if v["type"] == "result" {
                vec![projectb_kern::Ereignis::Fertig { erfolg: false, zusammenfassung: "Auftrag: Hallo".into() }]
            } else {
                projectb_kern::lies_claude(v)
            }
        },
        ..agent(false, &[])
    };
    let mut texte = Vec::new();
    assert!(!ausfuehren(&a, &wunsch(), Path::new("."), None, |t| texte.push(t)).unwrap().erfolg);
    assert_eq!(texte, ["Auftrag: Hallo", "Der Auftrag ist fehlgeschlagen."]);
}
