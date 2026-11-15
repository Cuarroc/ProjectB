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

fn stand(prozent: f64, endet: u64) -> Stand {
    let jetzt = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    Stand { prozent: if endet <= jetzt { 0 } else { prozent.round().clamp(0.0, 100.0) as u8 }, endet }
}

pub fn aus_claude(zeile: &Value) -> Option<Stand> {
    if zeile["type"] != "rate_limit_event" {
        return None;
    }
    let fenster = zeile.pointer("/rate_limit_info/unifiedWindows/seven_day")?;
    Some(stand(fenster["utilization"].as_f64()? * 100.0, fenster["resetsAt"].as_u64()?))
}

pub fn aus_codex(zeile: &Value) -> Option<Stand> {
    if zeile["type"] != "event_msg" || zeile["payload"]["type"] != "token_count" {
        return None;
    }
    let limits = zeile.pointer("/payload/rate_limits")?;
    ["primary", "secondary"].into_iter().find_map(|name| {
        let fenster = &limits[name];
        if fenster["window_minutes"].as_u64()? != 10080 {
            return None;
        }
        Some(stand(fenster["used_percent"].as_f64()?, fenster["resets_at"].as_u64()?))
    })
}

/// Liest höchstens drei Dateien; ohne Stand wird die nächstältere versucht.
pub fn codex_aus_sitzungen(ordner: &Path) -> Option<Stand> {
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
            if let Some(stand) = serde_json::from_slice(&zeile).ok().and_then(|v| aus_codex(&v)) {
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

fn lesen(daten: &[u8]) -> Option<BTreeMap<String, Stand>> {
    let werte: BTreeMap<String, Value> = serde_json::from_slice(daten).ok()?;
    let werte =
        werte.into_iter().filter_map(|(name, v)| Some((name, stand(v["prozent"].as_f64()?, v["endet"].as_u64()?))));
    Some(werte.collect())
}

/// Ungültige Einträge werden übersprungen; unlesbare Dateien ergeben eine leere Map.
pub fn laden(datei: impl AsRef<Path>) -> BTreeMap<String, Stand> {
    fs::read(datei).ok().and_then(|b| lesen(&b)).unwrap_or_default()
}

pub fn merken(datei: impl AsRef<Path>, anbieter: &str, stand: &Stand) -> io::Result<()> {
    let ziel = datei.as_ref();
    let mut werte = match fs::read(ziel) {
        Ok(daten) => lesen(&daten).unwrap_or_default(),
        Err(e) if e.kind() == io::ErrorKind::NotFound => BTreeMap::new(),
        Err(e) => return Err(e),
    };
    werte.insert(anbieter.to_owned(), stand.clone());
    let werte: BTreeMap<_, _> =
        werte.into_iter().map(|(k, v)| (k, json!({"prozent":v.prozent,"endet":v.endet}))).collect();
    crate::projekt::atomar_schreiben(ziel, &serde_json::to_vec_pretty(&werte)?)
}
