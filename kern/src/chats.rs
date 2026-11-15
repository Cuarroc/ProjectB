use serde_json::json;
pub use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub fn datei_fuer(ordner: &Path, projektpfad: &str) -> PathBuf {
    ordner.join("chats").join(crate::einstellungen::dateiname(projektpfad))
}

pub fn laden(pfad: impl AsRef<Path>) -> io::Result<Value> {
    match fs::read(pfad) {
        Ok(daten) => serde_json::from_slice(&daten).map_err(Into::into),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(json!({"chats": [], "aktiverChatId": null})),
        Err(e) => Err(e),
    }
}

pub fn speichern(pfad: impl AsRef<Path>, daten: &Value) -> io::Result<()> {
    let chats_gueltig = daten.get("chats").and_then(Value::as_array).is_some_and(|chats| {
        chats.iter().all(|chat| {
            chat.is_object()
                && chat.get("id").is_some_and(Value::is_string)
                && chat.get("verlauf").is_some_and(Value::is_array)
        })
    });
    let aktiv_gueltig = daten.get("aktiverChatId").is_some_and(|id| id.is_string() || id.is_null());
    if !daten.is_object() || !chats_gueltig || !aktiv_gueltig {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Ungültiges Chat-Format"));
    }
    let text = serde_json::to_vec(daten)?;
    // shortcut: höchstens 20 MB je Projekt, wenn Chats größer werden, Verlauf kürzen.
    if text.len() > 20 * 1024 * 1024 {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Chats sind größer als 20 MB"));
    }
    crate::projekt::atomar_schreiben(pfad.as_ref(), &text)
}
