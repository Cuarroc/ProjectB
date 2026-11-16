use kern::team::Team;
use kern::{
    anhalten::{Ordnerstatus, STANDARD_FRIST},
    serde_json::{self, Value},
};
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
    _team: tauri::State<'_, Mutex<Option<Team>>>,
    pfad: String,
    auftraege: Vec<TeamAuftrag>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Mutex<Option<Team>>>();
        let mut team = state.lock().map_err(|_| "Team-Zustand gesperrt")?;
        if team.as_ref().is_some_and(|t| !t.ersetzbar()) {
            return Err("Das letzte Team läuft noch oder ist nicht gesichert.".into());
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

#[tauri::command]
pub async fn team_anhalten(
    app: tauri::AppHandle,
    _state: tauri::State<'_, Mutex<Option<Team>>>,
    name: Option<String>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Mutex<Option<Team>>>();
        let mut team = state.lock().map_err(|_| "Team-Zustand gesperrt")?;
        let bericht = team
            .as_mut()
            .ok_or("Es läuft kein Team")?
            .anhalten(name.as_deref(), STANDARD_FRIST)
            .map_err(|e| e.to_string())?;
        if name.is_none() && bericht.alles_gesichert() {
            *team = None;
        }
        let ordner: Vec<_> = bericht
            .ordner
            .into_iter()
            .map(|o| match o.status {
                Ordnerstatus::Gesichert { sha } => {
                    serde_json::json!({"ordner": o.ordner, "status": "gesichert", "sha": sha})
                }
                Ordnerstatus::Sauber => serde_json::json!({"ordner": o.ordner, "status": "sauber"}),
                Ordnerstatus::Fehler { meldung } => {
                    serde_json::json!({"ordner": o.ordner, "status": "fehler", "meldung": meldung})
                }
            })
            .collect();
        let lauffehler: Vec<_> = bericht
            .lauffehler
            .into_iter()
            .map(|(pid, meldung)| serde_json::json!({"pid": pid, "meldung": meldung}))
            .collect();
        Ok(
            serde_json::json!({"ordner": ordner, "lauffehler": lauffehler,
            "fristUeberschritten": bericht.frist_ueberschritten}),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
