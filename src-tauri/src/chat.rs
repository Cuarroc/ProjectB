use std::{collections::BTreeMap, fs, path::Path};
use tauri::{Emitter, Manager};

#[tauri::command]
pub async fn auftrag_senden(
    app: tauri::AppHandle,
    chat: String,
    pfad: String,
    modell: String,
    effort: String,
    modus: String,
    sitzung: Option<BTreeMap<String, String>>,
    text: String,
) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let sitzung = sitzung
            .as_ref()
            .map(|s| {
                let feld = |name| {
                    s.get(name)
                        .map(String::as_str)
                        .ok_or_else(|| format!("Sitzung: {name} fehlt"))
                };
                Ok::<_, String>((feld("id")?, feld("anbieter")?, feld("pfad")?))
            })
            .transpose()?;
        let (anbieter, wunsch) =
            kern::chat::startwunsch(&modell, &effort, &modus, sitzung, &pfad, text)?;
        let ordner = Path::new(&pfad);
        if !ordner.is_dir() {
            return Err("Ordner fehlt oder ist kein Ordner".into());
        }
        let daten = app.path().app_data_dir().map_err(|e| e.to_string())?;
        fs::create_dir_all(&daten).map_err(|e| e.to_string())?;
        let kontingent = daten.join("kontingent.json");
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
        let mut json = antwort.json();
        if let Some(id) = antwort.sitzung {
            let name = if anbieter.name == "claude" {
                "Claude"
            } else {
                "Codex"
            };
            json["sitzung"] = [("id", id), ("anbieter", name.into()), ("pfad", pfad)]
                .into_iter()
                .collect();
        }
        Ok(tauri::ipc::Response::new(json.to_string()))
    })
    .await
    .map_err(|e| format!("Chat-Auftrag konnte nicht abgeschlossen werden: {e}"))?
}
