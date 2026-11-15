use projectb_kern::verbrauch::{
    anzeige, aus_claude, aus_codex, codex_aus_sitzungen, laden, merken, soll, Anzeige, Stand, Wert,
};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

const ENDE: u64 = 4_000_000_000;

struct Ordner(PathBuf);
impl Ordner {
    fn neu() -> Self {
        static NR: AtomicUsize = AtomicUsize::new(0);
        let pfad = Path::new(env!("CARGO_MANIFEST_DIR")).join("target").join(format!(
            "verbrauch test ü {} {}",
            std::process::id(),
            NR.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&pfad).unwrap();
        Self(pfad)
    }
}
impl Drop for Ordner {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

fn claude(prozent: f64) -> Value {
    json!({"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":ENDE,
        "rateLimitType":"five_hour","overageStatus":"rejected","isUsingOverage":false,
        "unifiedWindows":{"five_hour":{"utilization":0.15,"resetsAt":ENDE,"status":"allowed"},
        "seven_day":{"utilization":prozent / 100.0,"resetsAt":ENDE,"status":"allowed"}}}})
}

fn codex(prozent: f64, fenster: &str) -> Value {
    let mut v = json!({"timestamp":"…","type":"event_msg","payload":{"type":"token_count","info":{},
        "rate_limits":{"limit_id":"codex","primary":null,"secondary":null,"plan_type":"pro"}}});
    v["payload"]["rate_limits"][fenster] = json!({"used_percent":prozent,"window_minutes":10080,"resets_at":ENDE});
    v
}

#[test]
fn claude_nur_mit_wochenfenster() {
    assert_eq!(aus_claude(&claude(8.0)), Some(Stand { prozent: 8, endet: ENDE }));
    let mut v = claude(8.0);
    v["rate_limit_info"]["unifiedWindows"]["seven_day"] = Value::Null;
    assert_eq!(aus_claude(&v), None);
    assert_eq!(aus_claude(&json!({})), None);
}

#[test]
fn codex_wochenfenster_an_beiden_stellen() {
    for fenster in ["primary", "secondary"] {
        let mut v = codex(15.0, fenster);
        assert_eq!(aus_codex(&v), Some(Stand { prozent: 15, endet: ENDE }));
        v["payload"]["rate_limits"][fenster]["window_minutes"] = json!(300);
        assert_eq!(aus_codex(&v), None);
    }
    let mut v = codex(27.0, "secondary");
    v["payload"]["rate_limits"]["primary"] = json!({"window_minutes":300,"used_percent":90.0,"resets_at":ENDE});
    assert_eq!(aus_codex(&v), Some(Stand { prozent: 27, endet: ENDE }));
    assert_eq!(aus_codex(&json!({})), None);
}

#[test]
fn rundung_begrenzung_und_abgelaufene_fenster() {
    for (eingabe, erwartet) in [(-12.0, 0), (8.49, 8), (15.5, 16), (140.0, 100)] {
        assert_eq!(aus_claude(&claude(eingabe)).unwrap().prozent, erwartet);
        assert_eq!(aus_codex(&codex(eingabe, "primary")).unwrap().prozent, erwartet);
    }
    let mut c = claude(90.0);
    c["rate_limit_info"]["unifiedWindows"]["seven_day"]["resetsAt"] = json!(0);
    // P3: Das Ende muss mitrollen, damit das Soll zur neuen Woche gehört.
    let stand = aus_claude(&c).unwrap();
    assert_eq!(stand.prozent, 0);
    assert!(stand.endet > 0);
    assert_eq!(stand.endet % 604800, 0);
    let mut c = codex(90.0, "primary");
    c["payload"]["rate_limits"]["primary"]["resets_at"] = json!(0);
    // P3: Auch Codex braucht nach Ablauf das Ende der neuen Woche.
    let stand = aus_codex(&c).unwrap();
    assert_eq!(stand.prozent, 0);
    assert!(stand.endet > 0);
    assert_eq!(stand.endet % 604800, 0);
}

#[test]
fn soll_vor_am_anfang_in_der_mitte_und_nach_dem_ende() {
    for (jetzt, erwartet) in [(0, 0), (ENDE - 604800, 0), (ENDE - 302400, 50), (ENDE, 100), (u64::MAX, 100)] {
        assert_eq!(soll(ENDE, jetzt), erwartet);
    }
    assert_eq!(soll(0, 0), 100);
}

#[test]
fn sitzungen_neuester_tag_letzter_stand_und_begrenzter_rueckgriff() {
    let ordner = Ordner::neu();
    assert_eq!(codex_aus_sitzungen(&ordner.0), None);
    for tag in ["14", "15"] {
        let pfad = ordner.0.join("2026/11").join(tag);
        fs::create_dir_all(&pfad).unwrap();
        let inhalt = format!("kaputt\r\n{}\r\n{{\n{}\n{{}}\n", codex(8.0, "primary"), codex(15.0, "secondary"));
        fs::write(pfad.join("rollout-01-id.jsonl"), inhalt).unwrap();
    }
    let neu = ordner.0.join("2026/11/15/rollout-01-id.jsonl");
    let mut inhalt = format!("{}\n", codex(42.0, "primary")).into_bytes();
    inhalt.extend_from_slice(b"\xff\n");
    fs::write(&neu, inhalt).unwrap();
    assert_eq!(codex_aus_sitzungen(&ordner.0), Some(Stand { prozent: 42, endet: ENDE }));
    fs::write(&neu, "kaputt\n").unwrap();
    assert_eq!(codex_aus_sitzungen(&ordner.0), Some(Stand { prozent: 15, endet: ENDE }));
    for n in 2..5 {
        fs::write(neu.with_file_name(format!("rollout-0{n}-id.jsonl")), "{}\n").unwrap();
    }
    assert_eq!(codex_aus_sitzungen(&ordner.0), None);
}

#[test]
fn merken_laden_erhaelt_anbieter_und_repariert_kaputtes_json() {
    let ordner = Ordner::neu();
    let datei = ordner.0.join("verbrauch.json");
    let stand = Stand { prozent: 8, endet: ENDE };
    assert!(laden(&datei).is_empty());
    merken(&datei, "claude", &stand).unwrap();
    merken(&datei, "codex", &stand).unwrap();
    merken(&datei, "claude", &Stand { prozent: 16, endet: ENDE }).unwrap();
    assert_eq!(laden(&datei)["claude"].prozent, 16);
    assert_eq!(laden(&datei)["codex"], stand);
    assert_eq!(laden(&datei).len(), 2);
    for inhalt in ["{", "null", "[]", r#"{"claude":{"prozent":8}}"#] {
        fs::write(&datei, inhalt).unwrap();
        assert!(laden(&datei).is_empty());
        merken(&datei, "claude", &stand).unwrap();
        assert_eq!(laden(&datei), [("claude".into(), stand.clone())].into());
    }
    merken(&datei, "claude", &Stand { prozent: 90, endet: 0 }).unwrap();
    assert_eq!(laden(&datei)["claude"].prozent, 0);
    assert!(merken(datei.join("blockiert.json"), "claude", &stand).is_err());
    assert_eq!(fs::read_dir(&ordner.0).unwrap().count(), 1);
}

#[test]
fn lesefehler_laesst_datei_und_inhalt_unveraendert() {
    let ordner = Ordner::neu();
    let datei = ordner.0.join("verbrauch.json");
    fs::create_dir(&datei).unwrap();
    fs::write(datei.join("behalten"), "Arbeit").unwrap();
    let lesefehler = fs::read(&datei).unwrap_err();
    assert!(laden(&datei).is_empty());
    assert_eq!(merken(&datei, "claude", &Stand { prozent: 8, endet: ENDE }).unwrap_err().kind(), lesefehler.kind());
    assert!(datei.is_dir());
    assert_eq!(fs::read_to_string(datei.join("behalten")).unwrap(), "Arbeit");
    assert_eq!(fs::read_dir(&datei).unwrap().count(), 1);
    assert_eq!(fs::read_dir(&ordner.0).unwrap().count(), 1);
}

#[test]
fn sitzungen_neueste_aenderung_gewinnt_vor_pfad() {
    let ordner = Ordner::neu();
    let pfad = ordner.0.join("2026/11/15");
    fs::create_dir_all(&pfad).unwrap();
    for (name, prozent, sekunden) in [("rollout-a.jsonl", 42.0, 2), ("rollout-z.jsonl", 8.0, 1)] {
        let datei = fs::File::create(pfad.join(name)).unwrap();
        serde_json::to_writer(&datei, &codex(prozent, "primary")).unwrap();
        datei.set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(sekunden)).unwrap();
    }
    assert_eq!(codex_aus_sitzungen(&ordner.0), Some(Stand { prozent: 42, endet: ENDE }));
}

#[test]
fn kaputter_eintrag_erhaelt_andere_anbieter_beim_laden_und_merken() {
    let ordner = Ordner::neu();
    let datei = ordner.0.join("verbrauch.json");
    fs::write(&datei, json!({"claude": {"prozent": 8, "endet": ENDE}, "codex": {}}).to_string()).unwrap();
    let stand = Stand { prozent: 8, endet: ENDE };
    assert_eq!(laden(&datei), [("claude".into(), stand.clone())].into());
    merken(&datei, "dritter", &stand).unwrap();
    assert_eq!(laden(&datei), [("claude".into(), stand.clone()), ("dritter".into(), stand)].into());
}

#[test]
fn anzeige_ohne_stand_und_mit_eigenem_soll_je_anbieter() {
    let ordner = Ordner::neu();
    let datei = ordner.0.join("verbrauch.json");
    let sitzungen = ordner.0.join("sitzungen");
    let jetzt = ENDE - 302400;
    assert_eq!(anzeige(&datei, &sitzungen, jetzt), Anzeige { claude: None, codex: None });
    merken(&datei, "claude", &Stand { prozent: 8, endet: ENDE }).unwrap();
    assert_eq!(
        anzeige(&datei, &sitzungen, jetzt),
        Anzeige { claude: Some(Wert { genutzt: 8, soll: 50 }), codex: None }
    );
    merken(&datei, "codex", &Stand { prozent: 15, endet: ENDE + 151200 }).unwrap();
    assert_eq!(
        anzeige(&datei, &sitzungen, jetzt),
        Anzeige { claude: Some(Wert { genutzt: 8, soll: 50 }), codex: Some(Wert { genutzt: 15, soll: 25 }) }
    );
}

#[test]
fn anzeige_codex_bevorzugt_sitzung_sonst_cache_auch_ohne_claude() {
    let ordner = Ordner::neu();
    let datei = ordner.0.join("verbrauch.json");
    let sitzungen = ordner.0.join("sitzungen");
    let tag = sitzungen.join("2026/11/15");
    fs::create_dir_all(&tag).unwrap();
    fs::write(tag.join("rollout-1.jsonl"), codex(42.0, "secondary").to_string()).unwrap();
    merken(&datei, "codex", &Stand { prozent: 15, endet: ENDE + 151200 }).unwrap();
    assert_eq!(
        anzeige(&datei, &sitzungen, ENDE - 302400),
        Anzeige { claude: None, codex: Some(Wert { genutzt: 42, soll: 50 }) }
    );
    fs::write(tag.join("rollout-1.jsonl"), "kaputt").unwrap();
    assert_eq!(
        anzeige(&datei, &sitzungen, ENDE - 302400),
        Anzeige { claude: None, codex: Some(Wert { genutzt: 15, soll: 25 }) }
    );
}

#[test]
fn anzeige_abgelaufenes_fenster_aus_cache_und_sitzung_rollt_mit() {
    let ordner = Ordner::neu();
    let datei = ordner.0.join("verbrauch.json");
    let sitzungen = ordner.0.join("sitzungen");
    let tag = sitzungen.join("2026/11/15");
    fs::create_dir_all(&tag).unwrap();
    fs::write(tag.join("rollout-1.jsonl"), codex(90.0, "primary").to_string()).unwrap();
    merken(&datei, "claude", &Stand { prozent: 90, endet: ENDE }).unwrap();
    merken(&datei, "codex", &Stand { prozent: 90, endet: ENDE }).unwrap();
    for (jetzt, erwartet) in [(ENDE, 0), (ENDE + 2 * 604800 + 302400, 50)] {
        let erwartet = Anzeige {
            claude: Some(Wert { genutzt: 0, soll: erwartet }),
            codex: Some(Wert { genutzt: 0, soll: erwartet }),
        };
        assert_eq!(anzeige(&datei, &sitzungen, jetzt), erwartet);
        assert_eq!(anzeige(&datei, &ordner.0.join("fehlt"), jetzt), erwartet);
    }
}
