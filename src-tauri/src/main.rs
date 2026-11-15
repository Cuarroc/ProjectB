#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod chat;
mod einstellungen;
mod kontingent;
mod projekt;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            chat::auftrag_senden,
            einstellungen::einstellungen_laden,
            einstellungen::einstellungen_speichern,
            kontingent::kontingent,
            projekt::projekt_pruefen,
            projekt::projekt_oeffnen,
            projekt::projekte_zuletzt,
        ])
        .run(tauri::generate_context!())
        .map_err(|e| format!("Fehler beim Start von ProjectB: {e}").into())
}
