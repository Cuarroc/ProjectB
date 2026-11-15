use std::{
    collections::BTreeMap,
    env,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

type Kontingent = BTreeMap<&'static str, Option<BTreeMap<&'static str, u8>>>;

fn antwort(anzeige: kern::verbrauch::Anzeige) -> Kontingent {
    [("claude", anzeige.claude), ("codex", anzeige.codex)]
        .into_iter()
        .map(|(name, wert)| {
            (
                name,
                wert.map(|w| BTreeMap::from([("genutzt", w.genutzt), ("soll", w.soll)])),
            )
        })
        .collect()
}

#[tauri::command(async)]
pub fn kontingent(app: tauri::AppHandle) -> Result<Kontingent, String> {
    let datei = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("kontingent.json");
    let codex = match env::var_os("CODEX_HOME") {
        Some(home) => PathBuf::from(home),
        None => app
            .path()
            .home_dir()
            .map_err(|e| e.to_string())?
            .join(".codex"),
    }
    .join("sessions");
    let jetzt = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    Ok(antwort(kern::verbrauch::anzeige(&datei, &codex, jetzt)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn antwort_mit_getrennten_fenstern_und_unbekannt() {
        let wert = |genutzt, soll| Some(kern::verbrauch::Wert { genutzt, soll });
        let daten = antwort(kern::verbrauch::Anzeige {
            claude: wert(17, 57),
            codex: wert(86, 63),
        });
        assert_eq!(
            daten["claude"],
            Some(BTreeMap::from([("genutzt", 17), ("soll", 57)]))
        );
        assert_eq!(
            daten["codex"],
            Some(BTreeMap::from([("genutzt", 86), ("soll", 63)]))
        );
        assert_eq!(
            antwort(kern::verbrauch::Anzeige {
                claude: None,
                codex: None
            }),
            BTreeMap::from([("claude", None), ("codex", None)])
        );
    }
}
