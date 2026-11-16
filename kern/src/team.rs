use crate::{
    arbeitskopie, chat, start,
    zustand::{AgentZustand, Stammdaten},
    Anbieter, Ereignis, Lauf,
};
use std::{
    io,
    path::{Path, PathBuf},
    sync::{mpsc, Arc},
    thread,
};

#[derive(serde::Deserialize)]
pub struct TeamAuftrag {
    pub name: String,
    pub anbieter: String,
    pub modell: String,
    pub effort: String,
    pub text: String,
}

pub struct Team {
    laeufe: Vec<Lauf>,
    ordner: Vec<PathBuf>,
}

impl Team {
    pub fn starten(
        projekt: &Path,
        auftraege: Vec<TeamAuftrag>,
        melden: impl Fn(String) + Send + Sync + 'static,
    ) -> io::Result<Self> {
        Self::starten_mit(projekt, auftraege, melden, start::starten)
    }

    /// Austauschbarer Prozessstart für Tests; Produktion verwendet `start::starten`.
    pub fn starten_mit(
        projekt: &Path,
        auftraege: Vec<TeamAuftrag>,
        melden: impl Fn(String) + Send + Sync + 'static,
        starten: impl Fn(&Anbieter, &start::Startwunsch, &Path) -> io::Result<Lauf>,
    ) -> io::Result<Self> {
        if auftraege.len() > 3 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Höchstens 3 Agenten pro Team"));
        }
        let melden = Arc::new(melden);
        let mut team = Self { laeufe: Vec::new(), ordner: Vec::new() };
        for auftrag in auftraege {
            let mut stammdaten = Stammdaten {
                id: auftrag.name.clone(),
                name: auftrag.name.clone(),
                anbieter: auftrag.anbieter.clone(),
                modell: auftrag.modell.clone(),
                effort: auftrag.effort.clone(),
                arbeitskopie: String::new(),
            };
            let lauf = (|| {
                let (anbieter, wunsch) =
                    chat::startwunsch(&auftrag.modell, &auftrag.effort, "Ausführen", None, "", auftrag.text)
                        .map_err(io::Error::other)?;
                if !auftrag.anbieter.eq_ignore_ascii_case(anbieter.name) {
                    return Err(io::Error::new(io::ErrorKind::InvalidInput, "Anbieter passt nicht zum Modell"));
                }
                let kopie = arbeitskopie::anlegen_in(projekt, &auftrag.name, Path::new(".worktrees"))?;
                stammdaten.arbeitskopie = kopie.pfad.to_string_lossy().into_owned();
                team.ordner.push(kopie.pfad.clone());
                starten(anbieter, &wunsch, &kopie.pfad)
            })();
            let mut zustand = AgentZustand::neu(stammdaten);
            match lauf {
                Ok(mut lauf) => {
                    // Nur den Empfänger abgeben: der Lauf samt Job-Objekt bleibt für Anhalten erreichbar.
                    let ereignisse = std::mem::replace(&mut lauf.ereignisse, mpsc::channel().1);
                    team.laeufe.push(lauf);
                    let melden = Arc::clone(&melden);
                    thread::spawn(move || {
                        let mut zuletzt = zustand.als_json();
                        melden(zuletzt.to_string());
                        for ereignis in ereignisse {
                            zustand.anwenden(&ereignis);
                            let json = zustand.als_json();
                            if json != zuletzt {
                                melden(json.to_string());
                                zuletzt = json;
                            }
                        }
                    });
                }
                Err(fehler) => {
                    zustand.anwenden(&Ereignis::Fertig { erfolg: false, zusammenfassung: fehler.to_string() });
                    melden(zustand.als_json().to_string());
                }
            }
        }
        Ok(team)
    }

    pub fn ordner(&self) -> &[PathBuf] {
        &self.ordner
    }

    pub fn laeufe_mut(&mut self) -> &mut [Lauf] {
        &mut self.laeufe
    }
}
