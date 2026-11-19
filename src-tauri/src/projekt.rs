use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;

// Die Standardbibliotheks-Map ist bereits serialisierbar, ohne neue Abhängigkeit.
type Projekt = BTreeMap<&'static str, String>;

fn antwort(projekt: kern::projekt::Projekt) -> Projekt {
    Projekt::from([
        ("projekt", projekt.projekt),
        ("pfad", projekt.pfad),
        ("zweig", projekt.zweig),
    ])
}

fn pruefen(pfad: &str) -> Result<kern::projekt::Projekt, String> {
    kern::projekt::pruefen(pfad).map_err(|e| format!("Projekt konnte nicht geprüft werden: {e}"))
}

fn oeffnen(pfad: &str, datei: &Path) -> Result<kern::projekt::Projekt, String> {
    kern::projekt::oeffnen(pfad, datei)
        .map_err(|e| format!("Projekt konnte nicht geöffnet werden: {e}"))
}

fn zuletzt(datei: &Path) -> Vec<String> {
    kern::projekt::zuletzt_laden(datei)
}

#[tauri::command(async)]
pub fn anhang_speichern(
    app: tauri::AppHandle,
    pfad: String,
    name: String,
    inhalt: Vec<u8>,
) -> Result<String, String> {
    kern::projekt::anhang_speichern(Path::new(&pfad), &zuletzt_datei(&app)?, &name, &inhalt)
        .map_err(|e| e.to_string())
}

fn datei_im_ordner(ordner: PathBuf) -> Result<PathBuf, String> {
    fs::create_dir_all(&ordner)
        .map_err(|e| format!("App-Datenordner konnte nicht angelegt werden: {e}"))?;
    Ok(ordner.join("zuletzt.json"))
}

fn zuletzt_datei(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let ordner = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App-Datenordner konnte nicht ermittelt werden: {e}"))?;
    datei_im_ordner(ordner)
}

#[tauri::command(async)]
pub fn projekt_pruefen(pfad: String) -> Result<Projekt, String> {
    pruefen(&pfad).map(antwort)
}

#[tauri::command(async)]
pub fn projekt_oeffnen(app: tauri::AppHandle, pfad: String) -> Result<Projekt, String> {
    oeffnen(&pfad, &zuletzt_datei(&app)?).map(antwort)
}

#[tauri::command(async)]
pub fn projekte_zuletzt(app: tauri::AppHandle) -> Vec<String> {
    match zuletzt_datei(&app) {
        Ok(datei) => zuletzt(&datei),
        Err(_) => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_datenordner_und_antwort() {
        let basis = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join(format!("tauri projekt ü {}", std::process::id()));
        let datei = datei_im_ordner(basis.join("app daten")).unwrap();
        assert_eq!(datei.file_name().unwrap(), "zuletzt.json");
        assert!(datei.parent().unwrap().is_dir());
        let projekt = kern::projekt::Projekt {
            projekt: "repo".into(),
            pfad: basis.join("repo").to_str().unwrap().into(),
            zweig: "projekt-test".into(),
        };
        assert_eq!(
            antwort(projekt.clone()),
            Projekt::from([
                ("projekt", "repo".into()),
                ("pfad", projekt.pfad.clone()),
                ("zweig", "projekt-test".into()),
            ])
        );
        fs::write(&datei, "[]").unwrap();
        assert!(datei_im_ordner(datei.join("blockiert"))
            .unwrap_err()
            .contains("App-Datenordner"));
        fs::remove_dir_all(basis).unwrap();
    }
}
