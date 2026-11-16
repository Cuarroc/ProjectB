#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod chat;
mod chats;
mod einstellungen;
mod kontingent;
mod projekt;
mod team;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tauri::Builder::default()
        .manage(std::sync::Mutex::new(None::<kern::team::Team>))
        .invoke_handler(tauri::generate_handler![
            team::team_starten,
            chat::auftrag_senden,
            chats::chats_laden,
            chats::chats_speichern,
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
