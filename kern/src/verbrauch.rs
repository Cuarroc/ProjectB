use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs,
    io::{self, BufRead, BufReader},
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

const WOCHE: u64 = 604800;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stand {
    pub prozent: u8,
    pub endet: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Wert {
    pub genutzt: u8,
    pub soll: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Anzeige {
    pub claude: Option<Wert>,
    pub codex: Option<Wert>,
}

fn jetzt() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

fn stand(prozent: f64, endet: u64, jetzt: u64) -> Stand {
    if endet <= jetzt {
        return Stand { prozent: 0, endet: jetzt.saturating_add(WOCHE - (jetzt - endet) % WOCHE) };
    }
    Stand { prozent: prozent.round().clamp(0.0, 100.0) as u8, endet }
}

pub fn aus_claude(zeile: &Value) -> Option<Stand> {
    aus_claude_zu(zeile, jetzt())
}

fn aus_claude_zu(zeile: &Value, jetzt: u64) -> Option<Stand> {
    if zeile["type"] != "rate_limit_event" {
        return None;
    }
    let fenster = zeile.pointer("/rate_limit_info/unifiedWindows/seven_day")?;
    Some(stand(fenster["utilization"].as_f64()? * 100.0, fenster["resetsAt"].as_u64()?, jetzt))
}

pub fn aus_codex(zeile: &Value) -> Option<Stand> {
    aus_codex_zu(zeile, jetzt())
}

fn aus_codex_zu(zeile: &Value, jetzt: u64) -> Option<Stand> {
    if zeile["type"] != "event_msg" || zeile["payload"]["type"] != "token_count" {
        return None;
    }
    let limits = zeile.pointer("/payload/rate_limits")?;
    ["primary", "secondary"].into_iter().find_map(|name| {
        let fenster = &limits[name];
        if fenster["window_minutes"].as_u64()? != 10080 {
            return None;
        }
        Some(stand(fenster["used_percent"].as_f64()?, fenster["resets_at"].as_u64()?, jetzt))
    })
}

/// Liest höchstens drei Dateien; ohne Stand wird die nächstältere versucht.
pub fn codex_aus_sitzungen(ordner: &Path) -> Option<Stand> {
    codex_aus_sitzungen_zu(ordner, jetzt())
}

fn codex_aus_sitzungen_zu(ordner: &Path, jetzt: u64) -> Option<Stand> {
    let mut ordner = vec![ordner.to_path_buf()];
    for _ in 0..3 {
        ordner = ordner
            .iter()
            .flat_map(|p| fs::read_dir(p).ok().into_iter().flatten())
            .filter_map(Result::ok)
            .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
            .map(|e| e.path())
            .collect();
    }
    let mut dateien: Vec<_> = ordner
        .iter()
        .flat_map(|p| fs::read_dir(p).ok().into_iter().flatten())
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .map(|e| e.path())
        .filter(|p| {
            p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("rollout-") && n.ends_with(".jsonl"))
        })
        .map(|p| (fs::metadata(&p).and_then(|m| m.modified()).ok(), p))
        .collect();
    dateien.sort();
    for (_, pfad) in dateien.iter().rev().take(3) {
        let Ok(datei) = fs::File::open(pfad) else { continue };
        let mut leser = BufReader::new(datei);
        let (mut zeile, mut letzter) = (Vec::new(), None);
        loop {
            zeile.clear();
            match leser.read_until(b'\n', &mut zeile) {
                Ok(0) | Err(_) => break,
                Ok(_) => {}
            }
            if let Some(stand) = serde_json::from_slice(&zeile).ok().and_then(|v| aus_codex_zu(&v, jetzt)) {
                letzter = Some(stand);
            }
        }
        if letzter.is_some() {
            return letzter;
        }
    }
    None
}

pub fn soll(endet: u64, jetzt: u64) -> u8 {
    let vergangen = WOCHE - endet.saturating_sub(jetzt).min(WOCHE);
    (vergangen as f64 * 100.0 / WOCHE as f64).round() as u8
}

fn lesen(daten: &[u8], jetzt: u64) -> Option<BTreeMap<String, Stand>> {
    let werte: BTreeMap<String, Value> = serde_json::from_slice(daten).ok()?;
    let werte = werte
        .into_iter()
        .filter_map(|(name, v)| Some((name, stand(v["prozent"].as_f64()?, v["endet"].as_u64()?, jetzt))));
    Some(werte.collect())
}

/// Ungültige Einträge werden übersprungen; unlesbare Dateien ergeben eine leere Map.
pub fn laden(datei: impl AsRef<Path>) -> BTreeMap<String, Stand> {
    laden_zu(datei.as_ref(), jetzt())
}

fn laden_zu(datei: &Path, jetzt: u64) -> BTreeMap<String, Stand> {
    fs::read(datei).ok().and_then(|b| lesen(&b, jetzt)).unwrap_or_default()
}

/// Beide Anbieter verwenden ihr eigenes Wochenfenster und denselben Zeitpunkt.
pub fn anzeige(datei: &Path, codex_sitzungen: &Path, jetzt: u64) -> Anzeige {
    let mut gespeichert = laden_zu(datei, jetzt);
    let wert = |s: Stand| Wert { genutzt: s.prozent, soll: soll(s.endet, jetzt) };
    Anzeige {
        claude: gespeichert.remove("claude").map(wert),
        codex: codex_aus_sitzungen_zu(codex_sitzungen, jetzt).or_else(|| gespeichert.remove("codex")).map(wert),
    }
}

pub fn merken(datei: impl AsRef<Path>, anbieter: &str, stand: &Stand) -> io::Result<()> {
    let ziel = datei.as_ref();
    let mut werte = match fs::read(ziel) {
        Ok(daten) => lesen(&daten, jetzt()).unwrap_or_default(),
        Err(e) if e.kind() == io::ErrorKind::NotFound => BTreeMap::new(),
        Err(e) => return Err(e),
    };
    werte.insert(anbieter.to_owned(), stand.clone());
    let werte: BTreeMap<_, _> =
        werte.into_iter().map(|(k, v)| (k, json!({"prozent":v.prozent,"endet":v.endet}))).collect();
    crate::projekt::atomar_schreiben(ziel, &serde_json::to_vec_pretty(&werte)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn echte_claude_zeile_vom_15_11_2026() {
        let zeile = r#"{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1794736200,"rateLimitType":"five_hour","overageStatus":"rejected","overageDisabledReason":"out_of_credits","isUsingOverage":false,"unifiedWindows":{"five_hour":{"utilization":0.15,"resetsAt":1794736200,"status":"allowed"},"seven_day":{"utilization":0.08,"resetsAt":1794988800,"status":"allowed"}}}}"#;
        assert_eq!(
            aus_claude_zu(&serde_json::from_str(zeile).unwrap(), 1794736200),
            Some(Stand { prozent: 8, endet: 1794988800 })
        );
    }

    #[test]
    fn ablauf_rollt_um_ganze_wochen_ueber_die_uebergebene_zeit() {
        let ende = 1_000_000;
        for (jetzt, neues_ende, erwartet) in [
            (ende, ende + WOCHE, 0),
            (ende + 2 * WOCHE, ende + 3 * WOCHE, 0),
            (ende + 2 * WOCHE + WOCHE / 2, ende + 3 * WOCHE, 50),
        ] {
            let stand = stand(90.0, ende, jetzt);
            assert_eq!(stand, Stand { prozent: 0, endet: neues_ende });
            assert!(stand.endet > jetzt);
            assert_eq!(soll(stand.endet, jetzt), erwartet);
        }
    }
}
