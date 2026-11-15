use kern::start::Startwunsch;
use std::{collections::BTreeMap, fs, path::Path};
use tauri::{Emitter, Manager};

#[tauri::command]
pub async fn auftrag_senden(
    app: tauri::AppHandle,
    chat: String,
    pfad: String,
    anbieter: String,
    sitzung: Option<String>,
    text: String,
) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let anbieter = kern::anbieter(&anbieter.to_ascii_lowercase())
            .ok_or_else(|| format!("Unbekannter Anbieter: {anbieter}"))?;
        let ordner = Path::new(&pfad);
        if !ordner.is_dir() {
            return Err("Ordner fehlt oder ist kein Ordner".into());
        }
        let daten = app.path().app_data_dir().map_err(|e| e.to_string())?;
        fs::create_dir_all(&daten).map_err(|e| e.to_string())?;
        let kontingent = daten.join("kontingent.json");
        // shortcut: Modus, Modell und Effort aus dem Chat folgen in P-5-2f
        let wunsch = Startwunsch {
            rolle: None,
            modell: None,
            effort: None,
            fortsetzen: sitzung,
            auftrag: text,
        };
        // shortcut: kein Anhalten des Chat-Laufs, kommt mit Funktion 3
        let mut sende_fehler = None;
        let antwort =
            kern::chat::ausfuehren(anbieter, &wunsch, ordner, Some(&kontingent), |text| {
                if let Err(e) = app.emit(
                    "chat-nachricht",
                    BTreeMap::from([("chat", &chat), ("text", &text)]),
                ) {
                    sende_fehler = Some(e);
                }
            })
            .map_err(|e| format!("Auftrag konnte nicht ausgeführt werden: {e}"))?;
        if let Some(e) = sende_fehler {
            return Err(format!("Chat-Antwort konnte nicht angezeigt werden: {e}"));
        }
        Ok(tauri::ipc::Response::new(antwort.json().to_string()))
    })
    .await
    .map_err(|e| format!("Chat-Auftrag konnte nicht abgeschlossen werden: {e}"))?
}
