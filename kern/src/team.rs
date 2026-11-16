use crate::{
    anhalten, arbeitskopie, chat, start, verbrauch,
    zustand::{AgentZustand, Stammdaten},
    Anbieter, Ereignis, Lauf,
};
use std::{
    io,
    path::{Path, PathBuf},
    sync::{mpsc, Arc},
    thread,
    time::Duration,
};

pub struct TeamAuftrag {
    pub name: String,
    pub anbieter: String,
    pub modell: String,
    pub effort: String,
    pub text: String,
}

pub struct Team {
    laeufe: Vec<(String, Lauf)>,
    ordner: Vec<PathBuf>,
    ordnernamen: Vec<String>,
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
        Self::starten_mit_kontingent(projekt, auftraege, None, melden, starten)
    }

    pub fn starten_mit_kontingent(
        projekt: &Path,
        auftraege: Vec<TeamAuftrag>,
        kontingent: Option<&Path>,
        melden: impl Fn(String) + Send + Sync + 'static,
        starten: impl Fn(&Anbieter, &start::Startwunsch, &Path) -> io::Result<Lauf>,
    ) -> io::Result<Self> {
        if auftraege.is_empty() {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Mindestens ein Auftrag"));
        }
        if auftraege.len() > 3 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Höchstens 3 Agenten pro Team"));
        }
        for (i, auftrag) in auftraege.iter().enumerate() {
            if auftraege[..i].iter().any(|vorher| vorher.name == auftrag.name) {
                return Err(io::Error::new(io::ErrorKind::InvalidInput, "Agentennamen müssen eindeutig sein"));
            }
        }
        let melden = Arc::new(melden);
        let mut team = Self { laeufe: vec![], ordner: vec![], ordnernamen: vec![] };
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
                team.ordnernamen.push(auftrag.name.clone());
                starten(anbieter, &wunsch, &kopie.pfad)
            })();
            let arbeitskopie = PathBuf::from(&stammdaten.arbeitskopie);
            let mut zustand = AgentZustand::neu(stammdaten);
            match lauf {
                Ok(mut lauf) => {
                    // Nur den Empfänger abgeben: der Lauf samt Job-Objekt bleibt für Anhalten erreichbar.
                    let ereignisse = std::mem::replace(&mut lauf.ereignisse, mpsc::channel().1);
                    team.laeufe.push((auftrag.name.clone(), lauf));
                    let melden = Arc::clone(&melden);
                    let kontingent = kontingent.map(Path::to_path_buf);
                    thread::spawn(move || {
                        let mut zuletzt = zustand.als_json();
                        melden(zuletzt.to_string());
                        loop {
                            let mut beendet = false;
                            let dateien_aktualisieren = match ereignisse.recv_timeout(Duration::from_secs(2)) {
                                Ok(ereignis) => {
                                    if let (Ereignis::Kontingent(stand), Some(datei)) = (&ereignis, &kontingent) {
                                        let _ = verbrauch::merken(datei, &auftrag.anbieter.to_ascii_lowercase(), stand);
                                    }
                                    beendet = matches!(ereignis, Ereignis::Beendet { .. });
                                    zustand.anwenden(&ereignis);
                                    beendet || matches!(ereignis, Ereignis::Werkzeug(_))
                                }
                                Err(mpsc::RecvTimeoutError::Timeout) => true,
                                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                            };
                            if dateien_aktualisieren {
                                if let Ok(dateien) = arbeitskopie::geaenderte_dateien(&arbeitskopie) {
                                    zustand.dateien_setzen(dateien);
                                }
                            }
                            let json = zustand.als_json();
                            if json != zuletzt {
                                melden(json.to_string());
                                zuletzt = json;
                            }
                            if beendet {
                                break;
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

    pub fn laeufe_mut(&mut self) -> Vec<&mut Lauf> {
        self.laeufe.iter_mut().map(|(_, lauf)| lauf).collect()
    }

    pub fn laeuft(&self) -> bool {
        self.laeufe.iter().any(|(_, lauf)| !lauf.beendet())
    }

    pub fn anhalten(&mut self, name: Option<&str>, frist: Duration) -> io::Result<anhalten::Bericht> {
        if name.is_some_and(|name| !self.ordnernamen.iter().any(|n| n == name)) {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Unbekannter Agentenname"));
        }
        let ordner: Vec<_> = self
            .ordner
            .iter()
            .zip(&self.ordnernamen)
            .filter(|(_, n)| name.is_none_or(|name| name == n.as_str()))
            .map(|(pfad, _)| pfad.clone())
            .collect();
        let laeufe = self
            .laeufe
            .iter_mut()
            .filter(|(n, _)| name.is_none_or(|name| name == n.as_str()))
            .map(|(_, lauf)| lauf)
            .collect();
        Ok(anhalten::alles_anhalten(laeufe, &ordner, frist))
    }
}
