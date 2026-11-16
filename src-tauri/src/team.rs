use kern::team::{Team, TeamAuftrag};
use std::{path::Path, sync::Mutex};
use tauri::{Emitter, Manager};

#[tauri::command]
pub async fn team_starten(
    app: tauri::AppHandle,
    team: tauri::State<'_, Mutex<Option<Team>>>,
    pfad: String,
    auftraege: Vec<TeamAuftrag>,
) -> Result<(), String> {
    if team.lock().map_err(|_| "Team-Zustand gesperrt")?.is_some() {
        return Err("Es läuft schon ein Team".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Mutex<Option<Team>>>();
        let mut team = state.lock().map_err(|_| "Team-Zustand gesperrt")?;
        if team.is_some() {
            return Err("Es läuft schon ein Team".into());
        }
        let sende_app = app.clone();
        *team = Some(
            Team::starten(Path::new(&pfad), auftraege, move |json| {
                if let Err(fehler) = sende_app.emit("team-agent", json) {
                    eprintln!("Team-Zustand konnte nicht angezeigt werden: {fehler}");
                }
            })
            .map_err(|e| e.to_string())?,
        );
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
