use kern::chats::{self, Value};
use std::{fs, path::PathBuf};
use tauri::Manager;

fn datei(app: &tauri::AppHandle, projekt: &str) -> Result<PathBuf, String> {
    let ordner = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App-Datenordner konnte nicht ermittelt werden: {e}"))?;
    Ok(chats::datei_fuer(&ordner, projekt))
}

#[tauri::command(async)]
pub fn chats_laden(app: tauri::AppHandle, projekt: String) -> Result<Value, String> {
    chats::laden(datei(&app, &projekt)?)
        .map_err(|e| format!("Chats konnten nicht geladen werden: {e}"))
}

#[tauri::command(async)]
pub fn chats_speichern(app: tauri::AppHandle, projekt: String, daten: Value) -> Result<(), String> {
    let pfad = datei(&app, &projekt)?;
    let ordner = pfad.parent().ok_or("Chat-Ordner fehlt")?;
    fs::create_dir_all(ordner)
        .map_err(|e| format!("Chat-Ordner konnte nicht angelegt werden: {e}"))?;
    chats::speichern(pfad, &daten)
        .map_err(|e| format!("Chats konnten nicht gespeichert werden: {e}"))
}
