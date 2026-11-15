use projectb_kern::{
    chat::{ausfuehren, startwunsch},
    start::{argumente, Effort, Startwunsch},
    verbrauch::{laden, Stand},
    Anbieter, Ereignis, CLAUDE, CODEX,
};
use std::{fs, path::Path};

#[test]
fn chat_auswahl_erreicht_die_argumente_beider_anbieter() {
    for (modell, name, cli) in [
        ("Opus 5.5", "claude", "claude-opus-5-5"),
        ("Sonnet 5.5", "claude", "claude-sonnet-5-5"),
        ("Haiku 5.5", "claude", "claude-haiku-5-5"),
        ("gpt-6.1-sol", "codex", "gpt-6.1-sol"),
    ] {
        for (text, effort, wert) in [
            ("Niedrig", Effort::Niedrig, "low"),
            ("Mittel", Effort::Mittel, "medium"),
            ("Hoch", Effort::Hoch, "high"),
            ("Sehr hoch", Effort::SehrHoch, "xhigh"),
        ] {
            let (a, w) = startwunsch(modell, text, "Ausführen", None, "projekt", "Hallo".into()).unwrap();
            assert_eq!(a.name, name);
            assert_eq!(w.modell.as_deref(), Some(cli));
            assert_eq!(w.effort, Some(effort));
            assert_eq!(w.prompt(), "Hallo");
            assert!(w.fortsetzen.is_none());
            let mut erwartet: Vec<String> = a.argumente.iter().map(|s| s.to_string()).collect();
            if name == "codex" {
                erwartet.pop();
            }
            erwartet.extend(["--model".into(), cli.into()]);
            if name == "claude" {
                erwartet.extend(["--effort".into(), wert.into()]);
            } else {
                erwartet.extend(["-c".into(), format!("model_reasoning_effort=\"{wert}\""), "-".into()]);
            }
            assert_eq!(argumente(a, &w).unwrap(), erwartet);
        }
    }
}

#[test]
fn nur_sitzungen_desselben_anbieters_und_pfads_werden_fortgesetzt() {
    for (modell, anbieter) in [("Opus 5.5", "Claude"), ("gpt-6.1-sol", "Codex")] {
        for (alt, pfad, erwartet) in
            [(anbieter, "projekt", Some("id")), (anbieter, "anders", None), ("fremd", "projekt", None)]
        {
            let (_, w) =
                startwunsch(modell, "Hoch", "Ausführen", Some(("id", alt, pfad)), "projekt", "Weiter".into()).unwrap();
            assert_eq!(w.fortsetzen.as_deref(), erwartet);
        }
    }
}

#[test]
fn unbekannte_chat_auswahl_liefert_deutschen_fehler() {
    for (modell, effort, fehler) in [("X", "Hoch", "Unbekanntes Modell: X"), ("Opus 5.5", "X", "Unbekannter Effort: X")]
    {
        assert_eq!(startwunsch(modell, effort, "Ausführen", None, ".", "Hallo".into()).err().unwrap(), fehler);
    }
}

fn agent(codex: bool, argumente: &'static [&'static str]) -> Anbieter {
    let basis = if codex { &CODEX } else { &CLAUDE };
    Anbieter { programm: env!("CARGO_BIN_EXE_test_agent"), argumente, ..*basis }
}

fn wunsch() -> Startwunsch {
    Startwunsch { rolle: None, modell: None, effort: None, fortsetzen: None, nur_lesen: false, auftrag: "Hallo".into() }
}

#[test]
fn beide_anbieter_liefern_text_sitzung_und_erfolg_nur_mit_ergebnis() {
    for a in [agent(false, &[]), agent(true, &["--codex"])] {
        let mut texte = Vec::new();
        let antwort = ausfuehren(&a, &wunsch(), Path::new("."), None, |t| texte.push(t)).unwrap();
        assert_eq!(texte, ["Auftrag: Hallo"]);
        assert_eq!(antwort.json(), serde_json::json!({"sitzung":"test-sitzung", "erfolg":true}));
    }
    let antwort = ausfuehren(&agent(false, &["--ohne-lesen"]), &wunsch(), Path::new("."), None, |_| {}).unwrap();
    assert_eq!(antwort.json(), serde_json::json!({"sitzung":null, "erfolg":false}));
}

#[test]
fn fehler_erscheint_im_chat_und_exit_code_entscheidet() {
    for (a, erwartet) in [
        (agent(true, &["--codex", "--exit-3"]), "Exit-Code: 3"),
        (agent(false, &["--fehler"]), "Exit-Code: 7). eine Meldung"),
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
            e.extend((v["type"] == "system").then(|| Ereignis::Sitzung("letzte-sitzung".into())));
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
fn fehlerfolgen_behalten_code_und_grund_ohne_doppelten_fehlersatz() {
    use Ereignis::{Fertig, Meldung, Text};
    let a = Anbieter {
        lesen: |v| match v["item"]["text"].as_str() {
            Some("Auftrag: Leer") => vec![Fertig { erfolg: false, zusammenfassung: "".into() }],
            Some("Auftrag: Fehler") => vec![Fertig { erfolg: false, zusammenfassung: "X".into() }],
            Some("Auftrag: Erfolg") => vec![Fertig { erfolg: true, zusammenfassung: "".into() }],
            Some("Auftrag: Text") => vec![Text("X".into()), Fertig { erfolg: false, zusammenfassung: "X".into() }],
            Some("Auftrag: Meldung") => vec![Meldung("alter Grund".into()), Meldung("ü".repeat(301))],
            _ => vec![],
        },
        ..agent(true, &["--codex", "--exit-1"])
    };
    for (fall, argumente, erwartet) in [
        ("Leer", &["--codex", "--exit-3"][..], vec!["Der Auftrag ist fehlgeschlagen (Exit-Code: 3).".into()]),
        ("Fehler", a.argumente, vec!["Der Auftrag ist fehlgeschlagen (Exit-Code: 1). X".into()]),
        ("Erfolg", a.argumente, vec!["Der Auftrag ist fehlgeschlagen (Exit-Code: 1).".into()]),
        ("Text", a.argumente, vec!["X".into(), "Der Auftrag ist fehlgeschlagen (Exit-Code: 1).".into()]),
        ("Meldung", a.argumente, vec![format!("Der Auftrag ist fehlgeschlagen (Exit-Code: 1). {}", "ü".repeat(300))]),
    ] {
        let mut texte = Vec::new();
        let w = Startwunsch { auftrag: fall.into(), ..wunsch() };
        assert!(!ausfuehren(&Anbieter { argumente, ..a }, &w, Path::new("."), None, |t| texte.push(t)).unwrap().erfolg);
        assert_eq!(texte, erwartet, "{fall}");
    }
    assert_eq!(
        projectb_kern::chat::chat_text(&Ereignis::Beendet { erfolg: false, code: None }, None),
        Some("Der Auftrag ist fehlgeschlagen (Exit-Code: unbekannt).".into())
    );
}

#[test]
fn planen_und_interview_sind_auch_beim_fortsetzen_nur_lesend() {
    for modus in ["Planen", "Interview"] {
        for (modell, name, cli) in [("Opus 5.5", "claude", "claude-opus-5-5"), ("gpt-6.1-sol", "codex", "gpt-6.1-sol")]
        {
            for sitzung in [None, Some(("id", name, "projekt"))] {
                let (a, w) = startwunsch(modell, "Hoch", modus, sitzung, "projekt", "Prüfe den Export".into()).unwrap();
                assert!(w.nur_lesen);
                let mut erwartet = if name == "claude" {
                    vec!["-p", "--output-format", "stream-json", "--verbose"]
                } else {
                    vec!["exec"]
                };
                if sitzung.is_some() {
                    erwartet.extend([if name == "claude" { "--resume" } else { "resume" }, "id"]);
                }
                if name == "codex" {
                    erwartet.push("--json");
                }
                erwartet.extend(["--model", cli]);
                if name == "claude" {
                    erwartet.extend([
                        "--effort",
                        "high",
                        "--permission-mode",
                        "plan",
                        "--settings",
                        r#"{"useAutoModeDuringPlan":false}"#,
                        "--disallowedTools=ExitPlanMode",
                    ]);
                } else {
                    erwartet.extend(["-c", "model_reasoning_effort=\"high\"", "-c", "sandbox_mode=\"read-only\"", "-"]);
                }
                assert_eq!(argumente(a, &w).unwrap(), erwartet);
                let rolle = w.rolle.as_deref().unwrap();
                assert_eq!(w.prompt(), format!("{rolle}\n\nPrüfe den Export"));
                assert!(rolle.contains("Ändere keine Dateien."));
                for vorgabe in if modus == "Planen" {
                    &["nur einen Plan", "Höchstens 3 Teilaufgaben", "Fertig, wenn", "freigegeben", "Kommentaren"]
                        as &[_]
                } else {
                    &["genau eine Frage pro Antwort", "2–4", "Liste", "bis du sicher bist", "zusammen", "Bestätigung"]
                        as &[_]
                } {
                    assert!(rolle.contains(vorgabe), "{modus}: {vorgabe}");
                }
            }
        }
    }
}

#[test]
fn unbekannter_modus_wird_abgelehnt() {
    for modus in ["", "planen", "Ausführen ", "Unbekannt"] {
        let fehler = startwunsch("Opus 5.5", "Hoch", modus, None, "projekt", "Auftrag".into()).err().unwrap();
        assert_eq!(fehler, format!("Unbekannter Modus: {modus}"));
    }
}
