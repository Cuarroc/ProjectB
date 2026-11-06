use projectb_kern::zustand::{AgentZustand, Stammdaten};
use projectb_kern::{lies_claude, lies_codex, Ereignis};
use serde_json::{json, Value};

fn neu() -> AgentZustand {
    AgentZustand::neu(Stammdaten {
        id: "a1".into(),
        name: "Kern".into(),
        anbieter: "Claude".into(),
        modell: "Modell".into(),
        effort: "Hoch".into(),
        arbeitskopie: "C:/Arbeit".into(),
    })
}

// Anbieter-JSONL; der Prozessabschluss kommt separat vom Lauf-Wächter.
const CLAUDE: &str = r#"{"type":"system","subtype":"init","model":"claude-opus-4-1"}
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read"},{"type":"text","text":"Tests grün"}]}}
{"type":"result","subtype":"success","is_error":false,"result":"Erledigt"}"#;
const CODEX: &str = r#"{"type":"thread.started","thread_id":"lauf-1"}
{"type":"turn.started"}
{"type":"item.started","item":{"type":"command_execution","command":"cargo test"}}
{"type":"item.completed","item":{"type":"agent_message","text":"Tests grün"}}
{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":20}}"#;

#[test]
fn anbieter_folgen_laufen_und_enden() {
    for (daten, lesen) in [(CLAUDE, lies_claude as fn(&Value) -> Vec<Ereignis>), (CODEX, lies_codex)] {
        for code in [0, 1] {
            let mut zustand = neu();
            let mut ausstehend = false;
            for zeile in daten.lines() {
                for e in lesen(&serde_json::from_str(zeile).unwrap()) {
                    ausstehend |= matches!(e, Ereignis::ErgebnisAusstehend);
                    zustand.anwenden(&e);
                }
                assert_eq!(zustand.als_json()["zustand"], "Arbeitet");
            }
            // Lauf übersetzt Codex' turn.completed erst nach dem Prozessende.
            if ausstehend {
                zustand.anwenden(&Ereignis::Fertig { erfolg: code == 0, zusammenfassung: String::new() });
            }
            zustand.anwenden(&Ereignis::Beendet { code: Some(code), erfolg: code == 0 });
            assert_eq!(zustand.als_json()["zustand"], if code == 0 { "Fertig" } else { "Problem" });
        }
    }
}

#[test]
fn erfolg_braucht_ergebnis_und_prozessabschluss() {
    let mut zustand = neu();
    zustand.anwenden(&Ereignis::Beendet { code: Some(0), erfolg: true });
    assert_eq!(zustand.als_json()["zustand"], "Arbeitet");
    zustand.anwenden(&Ereignis::Fertig { erfolg: true, zusammenfassung: "Fertig".into() });
    assert_eq!(zustand.als_json()["zustand"], "Fertig");
}

#[test]
fn anbieterfehler_und_befehlsmeldungen_unterscheiden() {
    for (daten, lesen, erwartet) in [
        (
            r#"{"type":"result","subtype":"error_during_execution","is_error":true,"errors":["Fehler"]}"#,
            lies_claude as fn(&Value) -> Vec<Ereignis>,
            "Problem",
        ),
        (r#"{"type":"turn.failed","error":{"message":"Fehler"}}"#, lies_codex, "Problem"),
        (
            r#"{"type":"item.completed","item":{"type":"command_execution","command":"cargo test","exit_code":1}}"#,
            lies_codex,
            "Arbeitet",
        ),
    ] {
        let mut zustand = neu();
        for e in lesen(&serde_json::from_str(daten).unwrap()) {
            zustand.anwenden(&e);
        }
        assert_eq!(zustand.als_json()["zustand"], erwartet);
    }
}

#[test]
fn roter_befehl_verhindert_erfolgreichen_lauf_nicht() {
    let daten = r#"{"type":"item.completed","item":{"type":"command_execution","command":"cargo test","exit_code":1}}
{"type":"item.completed","item":{"type":"agent_message","text":"Fehler behoben"}}
{"type":"turn.completed"}"#;
    let mut zustand = neu();
    for zeile in daten.lines() {
        for e in lies_codex(&serde_json::from_str(zeile).unwrap()) {
            zustand.anwenden(&e);
        }
    }
    // Das Ergebnis wird wie im Lauf-Wächter nach Prozessende bestätigt.
    zustand.anwenden(&Ereignis::Fertig { erfolg: true, zusammenfassung: String::new() });
    zustand.anwenden(&Ereignis::Beendet { code: Some(0), erfolg: true });
    assert_eq!(zustand.als_json()["zustand"], "Fertig");
}

#[test]
fn fehler_bleiben_trotz_spaeterem_erfolg_sichtbar() {
    let fehler = [
        Ereignis::Fertig { erfolg: false, zusammenfassung: "Fehler".into() },
        Ereignis::Beendet { code: Some(1), erfolg: true },
        Ereignis::Beendet { code: Some(0), erfolg: false },
        Ereignis::Meldung("Nicht angemeldet. Bitte anmelden.".into()),
    ];
    for e in fehler {
        let mut zustand = neu();
        zustand.anwenden(&e);
        assert_eq!(zustand.als_json()["zustand"], "Problem");
        zustand.anwenden(&Ereignis::Text("Nachlauf".into()));
        zustand.anwenden(&Ereignis::Fertig { erfolg: true, zusammenfassung: String::new() });
        zustand.anwenden(&Ereignis::Beendet { code: Some(0), erfolg: true });
        assert_eq!(zustand.als_json()["zustand"], "Problem");
    }
}

#[test]
fn json_hat_genau_die_agent_felder() {
    // Vertrag: origin/p-4b-2-daten:src/daten/typen.ts (PR #74).
    let mut schluessel = vec![
        "id",
        "name",
        "anbieter",
        "modell",
        "effort",
        "zustand",
        "fortschritt",
        "arbeitskopie",
        "liveZeile",
        "tokens",
        "laufzeitSekunden",
        "phasen",
        "dateien",
        "letzteZeilen",
        "tests",
        "schaetzung",
    ];
    schluessel.sort();
    let mut zustand = neu();
    zustand.anwenden(&Ereignis::Gestartet { modell: Some("Aktuelles Modell".into()) });
    let wert = zustand.als_json();
    assert_eq!(wert.as_object().unwrap().keys().map(String::as_str).collect::<Vec<_>>(), schluessel);
    assert_eq!(wert["modell"], "Aktuelles Modell");
    assert_eq!(wert["id"], "a1");
    assert_eq!(wert["tokens"], 0); // Die Leser geben usage noch nicht als Ereignis weiter.
}

#[test]
fn behaelt_die_neuesten_20_zeilen_auch_bei_mehrzeiligem_text() {
    let mut zustand = neu();
    zustand.anwenden(&Ereignis::Text((1..=25).map(|n| format!("Zeile {n}")).collect::<Vec<_>>().join("\n")));
    let erwartet: Vec<_> = (6..=25).map(|n| format!("Zeile {n}")).collect();
    assert_eq!(zustand.als_json()["letzteZeilen"], json!(erwartet));
    assert_eq!(zustand.als_json()["liveZeile"], "Zeile 25");
    zustand.anwenden(&Ereignis::Werkzeug("Read".into()));
    assert_eq!(zustand.als_json()["liveZeile"], "Read");
    zustand.anwenden(&Ereignis::Meldung("Hinweis zum Kontingent".into()));
    zustand.anwenden(&Ereignis::Unbekannt("neues_format".into()));
    assert_eq!(zustand.als_json()["zustand"], "Arbeitet");
}
