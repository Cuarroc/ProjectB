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
        fs::remove_dir_all(self.0.parent().unwrap()).unwrap();
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
