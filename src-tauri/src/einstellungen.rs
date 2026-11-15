use kern::einstellungen::{self, Value};
use std::{fs, path::PathBuf};
use tauri::Manager;

fn datei(app: &tauri::AppHandle, projekt: &str) -> Result<PathBuf, String> {
    let ordner = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App-Datenordner konnte nicht ermittelt werden: {e}"))?;
    Ok(einstellungen::datei_fuer(&ordner, projekt))
}

#[tauri::command(async)]
pub fn einstellungen_laden(app: tauri::AppHandle, projekt: String) -> Value {
    let werte = match datei(&app, &projekt) {
        Ok(pfad) => einstellungen::laden(pfad),
        Err(_) => einstellungen::Einstellungen::default(),
    };
    einstellungen::als_json(&werte)
}

#[tauri::command(async)]
pub fn einstellungen_speichern(
    app: tauri::AppHandle,
    projekt: String,
    werte: Value,
) -> Result<Value, String> {
    let pfad = datei(&app, &projekt)?;
    let ordner = pfad.parent().ok_or("Einstellungsordner fehlt")?;
    fs::create_dir_all(ordner)
        .map_err(|e| format!("Einstellungsordner konnte nicht angelegt werden: {e}"))?;
    let werte = einstellungen::aendern(pfad, &werte)
        .map_err(|e| format!("Einstellungen konnten nicht gespeichert werden: {e}"))?;
    Ok(einstellungen::als_json(&werte))
}
