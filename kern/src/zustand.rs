use crate::Ereignis;
use serde_json::{json, Value};
use std::collections::VecDeque;

/// Angaben des Auftrags, die der Ereignisstrom nicht vollständig liefert.
pub struct Stammdaten {
    pub id: String,
    pub name: String,
    pub anbieter: String,
    pub modell: String,
    pub effort: String,
    pub arbeitskopie: String,
}

/// Zustand genau eines Laufs. Für einen neuen Lauf eine neue Instanz anlegen.
pub struct AgentZustand {
    stammdaten: Stammdaten,
    live_zeile: String,
    letzte_zeilen: VecDeque<String>,
    ergebnis_ok: bool,
    beendet_ok: bool,
    problem: bool,
}

impl AgentZustand {
    pub fn neu(stammdaten: Stammdaten) -> Self {
        Self {
            stammdaten,
            live_zeile: String::new(),
            letzte_zeilen: VecDeque::new(),
            ergebnis_ok: false,
            beendet_ok: false,
            problem: false,
        }
    }

    pub fn anwenden(&mut self, ereignis: &Ereignis) {
        match ereignis {
            Ereignis::Gestartet { modell } => {
                if let Some(modell) = modell {
                    self.stammdaten.modell.clone_from(modell);
                }
            }
            Ereignis::Text(text) | Ereignis::Werkzeug(text) => self.zeilen(text),
            Ereignis::Fertig { erfolg, zusammenfassung } => {
                self.problem |= !erfolg;
                self.ergebnis_ok = *erfolg;
                self.zeilen(zusammenfassung);
            }
            Ereignis::Beendet { code, erfolg } => {
                self.problem |= !erfolg || code.is_some_and(|code| code != 0);
                self.beendet_ok = *erfolg;
            }
            Ereignis::Meldung(text) => {
                // Einzelne Werkzeugfehler sind kein Misserfolg des Agentenlaufs.
                self.problem |= text.to_lowercase().contains("nicht angemeldet");
                self.zeilen(text);
            }
            Ereignis::ErgebnisAusstehend | Ereignis::Unbekannt(_) => {}
        }
    }

    fn zeilen(&mut self, text: &str) {
        for zeile in text.lines() {
            self.live_zeile = zeile.to_owned();
            self.letzte_zeilen.push_back(zeile.to_owned());
            if self.letzte_zeilen.len() > 20 {
                self.letzte_zeilen.pop_front();
            }
        }
    }

    /// Vollständiger Agent-Vertrag. Ohne Ereignisbeleg bleiben Zähler bei 0,
    /// Sammlungen leer und optionale Auswertungen null. Tokens und Wartebedarf
    /// sind im aktuellen Ereignis-Typ nicht enthalten und werden nicht geschätzt.
    pub fn als_json(&self) -> Value {
        let zustand = if self.problem {
            "Problem"
        } else if self.ergebnis_ok && self.beendet_ok {
            "Fertig"
        } else {
            "Arbeitet"
        };
        json!({
            "id": self.stammdaten.id, "name": self.stammdaten.name,
            "anbieter": self.stammdaten.anbieter, "modell": self.stammdaten.modell,
            "effort": self.stammdaten.effort, "arbeitskopie": self.stammdaten.arbeitskopie,
            "zustand": zustand, "liveZeile": self.live_zeile, "letzteZeilen": self.letzte_zeilen,
            "tokens": 0, "laufzeitSekunden": 0, "fortschritt": 0,
            "phasen": [], "dateien": [], "tests": null, "schaetzung": null,
        })
    }
}
