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
    let projekt = pruefen(pfad)?;
    kern::projekt::zuletzt_merken(datei, &projekt.pfad)
        .map_err(|e| format!("Projekt konnte nicht gemerkt werden: {e}"))?;
    Ok(projekt)
}

fn zuletzt(datei: &Path) -> Vec<String> {
    kern::projekt::zuletzt_laden(datei)
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

#[tauri::command]
pub fn projekt_pruefen(pfad: String) -> Result<Projekt, String> {
    pruefen(&pfad).map(antwort)
}

#[tauri::command]
pub fn projekt_oeffnen(app: tauri::AppHandle, pfad: String) -> Result<Projekt, String> {
    oeffnen(&pfad, &zuletzt_datei(&app)?).map(antwort)
}

#[tauri::command]
pub fn projekte_zuletzt(app: tauri::AppHandle) -> Vec<String> {
    match zuletzt_datei(&app) {
        Ok(datei) => zuletzt(&datei),
        Err(_) => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn unterordner_oeffnen_merkt_wurzel_zuoberst() {
        let basis = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join(format!("tauri projekt ü {}", std::process::id()));
        let repo = basis.join("repo");
        let unterordner = repo.join("unter ordner");
        fs::create_dir_all(&unterordner).unwrap();
        let ausgabe = Command::new("git")
            .arg("-C")
            .arg(&repo)
            .args(["init", "-b", "projekt-test"])
            .output()
            .unwrap();
        assert!(
            ausgabe.status.success(),
            "{}",
            String::from_utf8_lossy(&ausgabe.stderr)
        );
        let datei = datei_im_ordner(basis.join("app daten")).unwrap();
        assert_eq!(datei.file_name().unwrap(), "zuletzt.json");
        assert!(zuletzt(&datei).is_empty());
        kern::projekt::zuletzt_merken(&datei, "anderes Projekt").unwrap();

        let geprueft = pruefen(unterordner.to_str().unwrap()).unwrap();
        assert_eq!(zuletzt(&datei), ["anderes Projekt"]);
        let projekt = oeffnen(unterordner.to_str().unwrap(), &datei).unwrap();
        assert_eq!(projekt, geprueft);
        assert_eq!(
            fs::canonicalize(&projekt.pfad).unwrap(),
            fs::canonicalize(&repo).unwrap()
        );
        assert_eq!(
            zuletzt(&datei),
            [projekt.pfad.clone(), "anderes Projekt".into()]
        );
        assert_eq!(
            antwort(projekt.clone()),
            Projekt::from([
                ("projekt", "repo".into()),
                ("pfad", projekt.pfad.clone()),
                ("zweig", "projekt-test".into()),
            ])
        );

        let fehlt = basis.join("fehlt");
        assert!(oeffnen(fehlt.to_str().unwrap(), &datei)
            .unwrap_err()
            .contains("Ordner fehlt"));
        assert_eq!(zuletzt(&datei)[0], projekt.pfad);
        let fehler = oeffnen(repo.to_str().unwrap(), &datei.join("blockiert")).unwrap_err();
        assert!(
            fehler.contains("Projekt konnte nicht gemerkt werden"),
            "{fehler}"
        );
        assert!(datei_im_ordner(datei.join("blockiert"))
            .unwrap_err()
            .contains("App-Datenordner"));
        fs::remove_dir_all(basis).unwrap();
    }
}
