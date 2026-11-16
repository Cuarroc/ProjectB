use kern::team::Team;
use std::{fs, path::Path, sync::Mutex};
use tauri::{Emitter, Manager};

#[derive(serde::Deserialize)]
pub struct TeamAuftrag {
    name: String,
    anbieter: String,
    modell: String,
    effort: String,
    text: String,
}

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
        let daten = app.path().app_data_dir().map_err(|e| e.to_string())?;
        fs::create_dir_all(&daten).map_err(|e| e.to_string())?;
        let kontingent = daten.join("kontingent.json");
        let auftraege = auftraege
            .into_iter()
            .map(|a| kern::team::TeamAuftrag {
                name: a.name,
                anbieter: a.anbieter,
                modell: a.modell,
                effort: a.effort,
                text: a.text,
            })
            .collect();
        let sende_app = app.clone();
        *team = Some(
            Team::starten_mit_kontingent(
                Path::new(&pfad),
                auftraege,
                Some(&kontingent),
                move |json| {
                    if let Err(fehler) = sende_app.emit("team-agent", json) {
                        eprintln!("Team-Zustand konnte nicht angezeigt werden: {fehler}");
                    }
                },
                kern::start::starten,
            )
            .map_err(|e| e.to_string())?,
        );
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
