use projectb_kern::einstellungen::*;
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

struct Datei(PathBuf);
impl Datei {
    fn neu() -> Self {
        static NR: AtomicUsize = AtomicUsize::new(0);
        let ordner = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target").join(format!(
            "einstellungen-{}-{}",
            std::process::id(),
            NR.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&ordner).unwrap();
        Self(ordner.join("projekt.json"))
    }
}
impl Drop for Datei {
    fn drop(&mut self) {
        let weg = fs::remove_dir_all(self.0.parent().unwrap());
        if !std::thread::panicking() {
            weg.unwrap();
        }
    }
}

#[test]
fn ohne_datei_sind_alle_werte_empfohlen() {
    let datei = Datei::neu();
    let e = laden(&datei.0);
    assert_eq!(e.ausfuehren.agenten_gleichzeitig, AgentenGleichzeitig::BisZu3);
    assert_eq!(e.ausfuehren.pruefung_durch, PruefungDurch::AndereModellfamilie);
    assert_eq!(e.ausfuehren.pruefrunden_hoechstens, Pruefrunden::Drei);
    assert_eq!(e.planen.plan, Plan::Normal);
    assert_eq!(e.planen.dauer_und_tokens_schaetzen, Schalter::An);
    assert_eq!(e.planen.bei_unklarem_nachfragen, Schalter::An);
    assert!(e.ausfuehren.ist_empfohlen());
    assert!(e.planen.ist_empfohlen());
}

#[test]
fn speichern_laden_rundreise_und_ersetzen() {
    let datei = Datei::neu();
    for (agenten, runden, plan) in [
        (AgentenGleichzeitig::Einer, Pruefrunden::Eins, Plan::Kurz),
        (AgentenGleichzeitig::BisZu5, Pruefrunden::Zwei, Plan::Ausfuehrlich),
    ] {
        let e = Einstellungen {
            rollen: Default::default(),
            prompt_bauen: Default::default(),
            berechtigung: Default::default(),
            ausfuehren: Ausfuehren {
                agenten_gleichzeitig: agenten,
                pruefung_durch: PruefungDurch::GleicheFamilie,
                pruefrunden_hoechstens: runden,
            },
            planen: Planen { plan, dauer_und_tokens_schaetzen: Schalter::Aus, bei_unklarem_nachfragen: Schalter::Aus },
        };
        assert!(!e.ausfuehren.ist_empfohlen());
        assert!(!e.planen.ist_empfohlen());
        speichern(&datei.0, &e).unwrap();
        assert_eq!(laden(&datei.0), e);
        assert_eq!(fs::read_dir(datei.0.parent().unwrap()).unwrap().count(), 1);
    }
}

#[test]
fn kaputtes_feld_faellt_einzeln_zurueck() {
    let datei = Datei::neu();
    let gueltig = json!({
        "ausfuehren": {"agentenGleichzeitig": "bisZu5", "pruefungDurch": "gleicheFamilie", "pruefrundenHoechstens": "eins"},
        "planen": {"plan": "kurz", "dauerUndTokensSchaetzen": "aus", "beiUnklaremNachfragen": "aus"}
    });
    fs::write(&datei.0, gueltig.to_string()).unwrap();
    let angepasst = laden(&datei.0);
    assert!(!angepasst.ausfuehren.ist_empfohlen());
    assert!(!angepasst.planen.ist_empfohlen());
    for modus in ["ausfuehren", "planen"] {
        for feld in gueltig[modus].as_object().unwrap().keys() {
            for defekt in [None, Some(json!("unbekannt")), Some(json!(42)), Some(json!(null)), Some(json!({}))] {
                let mut kaputt = gueltig.clone();
                kaputt[modus].as_object_mut().unwrap().remove(feld);
                if let Some(wert) = defekt {
                    kaputt[modus][feld] = wert;
                }
                fs::write(&datei.0, kaputt.to_string()).unwrap();
                let mut erwartet = angepasst.clone();
                match feld.as_str() {
                    "agentenGleichzeitig" => erwartet.ausfuehren.agenten_gleichzeitig = AgentenGleichzeitig::BisZu3,
                    "pruefungDurch" => erwartet.ausfuehren.pruefung_durch = PruefungDurch::AndereModellfamilie,
                    "pruefrundenHoechstens" => erwartet.ausfuehren.pruefrunden_hoechstens = Pruefrunden::Drei,
                    "plan" => erwartet.planen.plan = Plan::Normal,
                    "dauerUndTokensSchaetzen" => erwartet.planen.dauer_und_tokens_schaetzen = Schalter::An,
                    "beiUnklaremNachfragen" => erwartet.planen.bei_unklarem_nachfragen = Schalter::An,
                    _ => unreachable!(),
                }
                assert_eq!(laden(&datei.0), erwartet, "{modus}.{feld}");
            }
        }
    }
}

#[test]
fn umbenennungsfehler_laesst_ziel_und_keine_temp_datei_zurueck() {
    let datei = Datei::neu();
    fs::create_dir(&datei.0).unwrap();
    fs::write(datei.0.join("behalten"), "unveraendert").unwrap();
    assert!(speichern(&datei.0, &Einstellungen::default()).is_err());
    assert_eq!(fs::read_to_string(datei.0.join("behalten")).unwrap(), "unveraendert");
    assert_eq!(fs::read_dir(datei.0.parent().unwrap()).unwrap().count(), 1);
}

#[test]
fn kaputte_datei_und_schreibfehler_ohne_panic() {
    let datei = Datei::neu();
    for inhalt in ["{", "null", "[]", "{}", r#"{"ausfuehren":42,"planen":false}"#] {
        fs::write(&datei.0, inhalt).unwrap();
        assert_eq!(laden(&datei.0), Einstellungen::default());
    }
    assert!(speichern(datei.0.join("fehlt.json"), &Einstellungen::default()).is_err());
    assert_eq!(fs::read_to_string(&datei.0).unwrap(), r#"{"ausfuehren":42,"planen":false}"#);
}

#[test]
fn json_rundreise_aller_wertekombinationen() {
    for agenten in [AgentenGleichzeitig::Einer, AgentenGleichzeitig::BisZu3, AgentenGleichzeitig::BisZu5] {
        for pruefung in [PruefungDurch::AndereModellfamilie, PruefungDurch::GleicheFamilie] {
            for runden in [Pruefrunden::Eins, Pruefrunden::Zwei, Pruefrunden::Drei] {
                for plan in [Plan::Kurz, Plan::Normal, Plan::Ausfuehrlich] {
                    for schaetzen in [Schalter::An, Schalter::Aus] {
                        for nachfragen in [Schalter::An, Schalter::Aus] {
                            let e = Einstellungen {
                                rollen: Default::default(),
                                prompt_bauen: Default::default(),
                                berechtigung: Default::default(),
                                ausfuehren: Ausfuehren {
                                    agenten_gleichzeitig: agenten,
                                    pruefung_durch: pruefung,
                                    pruefrunden_hoechstens: runden,
                                },
                                planen: Planen {
                                    plan,
                                    dauer_und_tokens_schaetzen: schaetzen,
                                    bei_unklarem_nachfragen: nachfragen,
                                },
                            };
                            assert_eq!(aus_json(&als_json(&e)), e);
                        }
                    }
                }
            }
        }
    }
}

#[test]
fn json_schluessel_und_rueckfall_je_feld_wie_beim_laden() {
    let datei = Datei::neu();
    let mut gueltig = json!({
        "berechtigung": "Nur bei Wichtigem",
        "ausfuehren": {"agentenGleichzeitig": "einer", "pruefungDurch": "gleicheFamilie", "pruefrundenHoechstens": "zwei"},
        "planen": {"plan": "ausfuehrlich", "dauerUndTokensSchaetzen": "aus", "beiUnklaremNachfragen": "aus"}
    });
    gueltig["prompt_bauen"] = als_json(&Einstellungen::default())["prompt_bauen"].clone();
    gueltig["rollen"] = standardrollen();
    assert_eq!(als_json(&aus_json(&gueltig)), gueltig);
    let mut empfohlen = json!({
        "berechtigung": "Nur bei Wichtigem",
        "ausfuehren": {"agentenGleichzeitig": "bisZu3", "pruefungDurch": "andereModellfamilie", "pruefrundenHoechstens": "drei"},
        "planen": {"plan": "normal", "dauerUndTokensSchaetzen": "an", "beiUnklaremNachfragen": "an"}
    });
    empfohlen["prompt_bauen"] = gueltig["prompt_bauen"].clone();
    empfohlen["rollen"] = standardrollen();
    for modus in ["ausfuehren", "planen"] {
        for feld in gueltig[modus].as_object().unwrap().keys() {
            for defekt in [
                None,
                Some(json!("unbekannt")),
                Some(json!(42)),
                Some(json!(false)),
                Some(json!(null)),
                Some(json!([])),
                Some(json!({})),
            ] {
                let mut kaputt = gueltig.clone();
                kaputt[modus].as_object_mut().unwrap().remove(feld);
                if let Some(wert) = defekt {
                    kaputt[modus][feld] = wert;
                }
                let mut erwartet = gueltig.clone();
                erwartet[modus][feld] = empfohlen[modus][feld].clone();
                fs::write(&datei.0, kaputt.to_string()).unwrap();
                let e = aus_json(&kaputt);
                assert_eq!(als_json(&e), erwartet, "{modus}.{feld}");
                assert_eq!(e, laden(&datei.0));
                speichern(&datei.0, &e).unwrap();
                assert_eq!(
                    serde_json::from_slice::<serde_json::Value>(&fs::read(&datei.0).unwrap()).unwrap(),
                    erwartet
                );
            }
        }
    }
    for kaputt in [json!(null), json!([]), json!(42), json!({}), json!({"ausfuehren": false, "planen": 42})] {
        assert_eq!(als_json(&aus_json(&kaputt)), empfohlen);
    }
}

#[test]
fn projektdateien_sind_stabil_getrennt_und_windows_unabhaengig() {
    let datei = Datei::neu();
    let basis = datei.0.parent().unwrap();
    let erster = datei_fuer(basis, r"C:\Repo\X");
    assert_eq!(erster, basis.join("einstellungen").join("51b03d1b19c77b1a.json"));
    assert_eq!(erster, datei_fuer(basis, "c:/repo/x"));
    assert_eq!(datei_fuer(basis, r"\\Server\Repo\X"), datei_fuer(basis, "//server/repo/x"));
    let zweiter = datei_fuer(basis, "c:/repo/y");
    assert_ne!(erster, zweiter);
    assert!(!erster.parent().unwrap().exists());
    fs::create_dir_all(erster.parent().unwrap()).unwrap();
    let e = aus_json(&json!({"planen": {"plan": "kurz"}}));
    speichern(&erster, &e).unwrap();
    assert_eq!(laden(&erster), e);
    assert_eq!(laden(&zweiter), Einstellungen::default());
}

#[test]
fn aendern_bewahrt_lesefehler_und_andere_felder() {
    let datei = Datei::neu();
    let delta = json!({"ausfuehren": {"pruefrundenHoechstens": "zwei"}});
    fs::create_dir(&datei.0).unwrap();
    fs::write(datei.0.join("behalten"), "unveraendert").unwrap();
    assert!(aendern(&datei.0, &delta).is_err());
    assert_eq!(fs::read_to_string(datei.0.join("behalten")).unwrap(), "unveraendert");
    fs::remove_dir_all(&datei.0).unwrap();
    for basis in [None, Some("{"), Some(r#"{"planen":{"plan":"kurz"},"ausfuehren":{"agentenGleichzeitig":"einer"}}"#)] {
        if let Some(text) = basis {
            fs::write(&datei.0, text).unwrap();
        }
        let mut erwartet = als_json(&laden(&datei.0));
        erwartet["ausfuehren"]["pruefrundenHoechstens"] = json!("zwei");
        assert_eq!(als_json(&aendern(&datei.0, &delta).unwrap()), erwartet);
        assert_eq!(als_json(&laden(&datei.0)), erwartet);
    }
    let e = aendern(&datei.0, &json!({"planen": {"plan": 42}})).unwrap();
    assert_eq!(e.planen.plan, Plan::Normal);
    assert_eq!(e.ausfuehren.pruefrunden_hoechstens, Pruefrunden::Zwei);
}

#[test]
fn gleichzeitige_aenderungen_bleiben_alle_erhalten() {
    let datei = Datei::neu();
    let aenderungen = [
        json!({"berechtigung": "Vorsichtig"}),
        json!({"ausfuehren": {"agentenGleichzeitig": "einer"}}),
        json!({"ausfuehren": {"pruefungDurch": "gleicheFamilie"}}),
        json!({"ausfuehren": {"pruefrundenHoechstens": "eins"}}),
        json!({"planen": {"plan": "kurz"}}),
        json!({"planen": {"dauerUndTokensSchaetzen": "aus"}}),
        json!({"planen": {"beiUnklaremNachfragen": "aus"}}),
    ];
    let mut erwartet = als_json(&Einstellungen::default());
    for delta in &aenderungen {
        erwartet = als_json(&aendern(&datei.0, delta).unwrap());
    }
    for runde in 0..100 {
        speichern(&datei.0, &Einstellungen::default()).unwrap();
        let start = std::sync::Barrier::new(aenderungen.len());
        std::thread::scope(|threads| {
            for delta in &aenderungen {
                let (pfad, start) = (&datei.0, &start);
                threads.spawn(move || {
                    start.wait();
                    aendern(pfad, delta).unwrap();
                });
            }
        });
        assert_eq!(serde_json::from_slice::<Value>(&fs::read(&datei.0).unwrap()).unwrap(), erwartet, "Runde {runde}");
    }
}

#[test]
fn berechtigung_je_projekt_und_nur_gueltige_aenderungen() {
    let datei = Datei::neu();
    let basis = datei.0.parent().unwrap();
    let a = datei_fuer(basis, "projekt-a");
    let b = datei_fuer(basis, "projekt-b");
    fs::create_dir_all(a.parent().unwrap()).unwrap();
    for stufe in ["Vorsichtig", "Nur bei Wichtigem", "Autonom"] {
        let e = aendern(&a, &json!({"berechtigung": stufe, "planen": {"plan": "kurz"}})).unwrap();
        assert_eq!(als_json(&laden(&a))["berechtigung"], stufe);
        assert_eq!(laden(&b), Einstellungen::default());
        for unsinn in [json!("falsch"), json!(42), Value::Null] {
            assert_eq!(aendern(&a, &json!({"berechtigung": unsinn})).unwrap(), e);
            assert_eq!(laden(&a).planen.plan, Plan::Kurz);
            assert_eq!(als_json(&aus_json(&json!({"berechtigung": unsinn})))["berechtigung"], "Nur bei Wichtigem");
        }
        assert_eq!(
            aendern(&a, &json!({"ausfuehren": {"pruefrundenHoechstens": "zwei"}})).unwrap().berechtigung,
            e.berechtigung
        );
    }
    assert_eq!(als_json(&laden(&b))["berechtigung"], "Nur bei Wichtigem");
}

fn standardrollen() -> Value {
    json!({
        "orchestrator": {"modell": "Opus 5.5", "effort": "Hoch"},
        "reviewer": {
            "claude": {"modell": "Opus 5.5", "effort": "Hoch"},
            "codex": {"modell": "gpt-6.1-sol", "effort": "Hoch"}
        }
    })
}

#[test]
fn rollen_standard_und_rueckfall_je_feld() {
    let datei = Datei::neu();
    assert_eq!(als_json(&laden(&datei.0))["rollen"], standardrollen());
    let gueltig = json!({"rollen": {
        "orchestrator": {"modell": "gpt-6.1-sol", "effort": "Mittel"},
        "reviewer": {
            "claude": {"modell": "Sonnet 5.5", "effort": "Niedrig"},
            "codex": {"modell": "gpt-6.1-sol", "effort": "Sehr hoch"}
        }
    }});
    let standard = standardrollen();
    for pfad in ["/orchestrator", "/reviewer/claude", "/reviewer/codex"] {
        for feld in ["modell", "effort"] {
            for defekt in [None, Some(json!("unbekannt")), Some(json!(42)), Some(Value::Null), Some(json!({}))] {
                let mut kaputt = gueltig.clone();
                let rolle = kaputt["rollen"].pointer_mut(pfad).unwrap().as_object_mut().unwrap();
                rolle.remove(feld);
                if let Some(wert) = defekt {
                    rolle.insert(feld.into(), wert);
                }
                let mut erwartet = gueltig["rollen"].clone();
                erwartet.pointer_mut(pfad).unwrap()[feld] = standard.pointer(pfad).unwrap()[feld].clone();
                fs::write(&datei.0, kaputt.to_string()).unwrap();
                assert_eq!(als_json(&laden(&datei.0))["rollen"], erwartet, "{pfad}/{feld}");
            }
        }
    }
    for (familie, falsch) in [("claude", "gpt-6.1-sol"), ("codex", "Haiku 5.5")] {
        let mut kaputt = gueltig.clone();
        kaputt["rollen"]["reviewer"][familie]["modell"] = json!(falsch);
        let mut erwartet = gueltig["rollen"].clone();
        erwartet["reviewer"][familie]["modell"] = standard["reviewer"][familie]["modell"].clone();
        assert_eq!(als_json(&aus_json(&kaputt))["rollen"], erwartet);
    }
}

#[test]
fn rollen_aendern_nur_gueltiges_und_andere_werte_erhalten() {
    let datei = Datei::neu();
    let delta = json!({"berechtigung": "Vorsichtig", "planen": {"plan": "kurz"}, "rollen": {
        "orchestrator": {"modell": "Haiku 5.5", "effort": "Niedrig"},
        "reviewer": {"claude": {"modell": "Sonnet 5.5", "effort": "Sehr hoch"},
                     "codex": {"modell": "gpt-6.1-sol", "effort": "Mittel"}}
    }});
    let e = aendern(&datei.0, &delta).unwrap();
    assert_eq!(als_json(&laden(&datei.0))["rollen"], delta["rollen"]);
    for falsch in [json!("unbekannt"), json!(42), Value::Null, json!({}), json!(false)] {
        let ungueltig = json!({"rollen": {"orchestrator": {"modell": falsch, "effort": falsch},
            "reviewer": {"claude": {"modell": "gpt-6.1-sol", "effort": falsch},
                         "codex": {"modell": "Opus 5.5", "effort": falsch}}}});
        assert_eq!(aendern(&datei.0, &ungueltig).unwrap(), e);
    }
    let mut erwartet = als_json(&e);
    erwartet["rollen"]["reviewer"]["claude"]["effort"] = json!("Hoch");
    let e = aendern(&datei.0, &json!({"rollen": {"reviewer": {"claude": {"effort": "Hoch"}}}})).unwrap();
    assert_eq!(als_json(&laden(&datei.0)), erwartet);
    assert_eq!(als_json(&aendern(&datei.0, &json!({"rollen": false})).unwrap()), erwartet);
    assert_eq!(laden(datei.0.with_file_name("anderes-projekt.json")), Einstellungen::default());
    assert_eq!(als_json(&e), erwartet);
}

#[test]
fn prompt_bauen_altdatei_delta_und_empfehlung() {
    let datei = Datei::neu();
    fs::write(&datei.0, r#"{"planen":{"plan":"kurz"}}"#).unwrap();
    let alt = laden(&datei.0);
    assert_eq!(alt.prompt_bauen.laenge, Laenge::Mittel);
    assert_eq!(alt.prompt_bauen.auftrag_fuer, AuftragFuer::Orchestrator);
    assert_eq!(alt.prompt_bauen.abnahme_punkte_ergaenzen, Schalter::An);
    assert!(alt.prompt_bauen.ist_empfohlen());
    let mut erwartet = als_json(&alt);
    for (feld, wert) in [("laenge", "kurz"), ("auftragFuer", "codex"), ("abnahmePunkteErgaenzen", "aus")] {
        erwartet["prompt_bauen"][feld] = json!(wert);
        let neu = aendern(&datei.0, &json!({"prompt_bauen": {feld: wert}})).unwrap();
        assert_eq!(als_json(&neu), erwartet);
        assert_eq!(laden(&datei.0), neu);
        assert!(!neu.prompt_bauen.ist_empfohlen());
    }
    for (feld, wert) in [("laenge", "kurz"), ("auftragFuer", "claude"), ("abnahmePunkteErgaenzen", "aus")] {
        assert!(!aus_json(&json!({"prompt_bauen": {feld: wert}})).prompt_bauen.ist_empfohlen());
    }
}
