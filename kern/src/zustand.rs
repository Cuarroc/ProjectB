use crate::Ereignis;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::time::Instant;

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
    start: Option<Instant>,
    ende: Option<Instant>,
    letzte_antwort: String,
    dateien: Vec<Value>,
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
            start: None,
            ende: None,
            letzte_antwort: String::new(),
            dateien: Vec::new(),
        }
    }

    pub fn anwenden(&mut self, ereignis: &Ereignis) {
        self.anwenden_um(ereignis, Instant::now());
    }

    pub fn anwenden_um(&mut self, ereignis: &Ereignis, jetzt: Instant) {
        self.start.get_or_insert(jetzt);
        match ereignis {
            Ereignis::Sitzung(_) => {}
            Ereignis::Gestartet { modell } => {
                self.start = Some(jetzt);
                if let Some(modell) = modell {
                    self.stammdaten.modell.clone_from(modell);
                }
            }
            Ereignis::Text(text) => self.antwort(text),
            Ereignis::Werkzeug(text) => self.zeilen(text),
            Ereignis::Fertig { erfolg, zusammenfassung } => {
                self.problem |= !erfolg;
                self.ergebnis_ok = *erfolg;
                self.antwort(zusammenfassung);
            }
            Ereignis::Beendet { code, erfolg } => {
                self.ende.get_or_insert(jetzt);
                self.problem |= !erfolg || code.is_some_and(|code| code != 0);
                self.beendet_ok = *erfolg;
            }
            Ereignis::Meldung(text) => {
                // Einzelne Werkzeugfehler sind kein Misserfolg des Agentenlaufs.
                self.problem |= text.to_lowercase().contains("nicht angemeldet");
                self.zeilen(text);
            }
            Ereignis::ErgebnisAusstehend | Ereignis::Unbekannt(_) | Ereignis::Kontingent(_) => {}
        }
    }

    pub fn dateien_setzen(&mut self, dateien: Vec<Value>) {
        self.dateien = dateien;
    }

    fn antwort(&mut self, text: &str) {
        if !text.trim().is_empty() {
            self.letzte_antwort = text.trim_end().lines().last().unwrap_or_default().to_owned();
        }
        self.zeilen(text);
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
    /// Sammlungen leer und optionale Auswertungen null. Tokens werden nicht geschätzt.
    pub fn als_json(&self) -> Value {
        self.als_json_um(Instant::now())
    }

    pub fn als_json_um(&self, jetzt: Instant) -> Value {
        let zustand = if self.problem {
            "Problem"
        } else if self.ergebnis_ok && self.beendet_ok {
            if self.letzte_antwort.ends_with('?') {
                "Wartet auf dich"
            } else {
                "Fertig"
            }
        } else {
            "Arbeitet"
        };
        let laufzeit =
            self.start.map_or(0, |start| self.ende.unwrap_or(jetzt).saturating_duration_since(start).as_secs());
        json!({
            "id": self.stammdaten.id, "name": self.stammdaten.name,
            "anbieter": self.stammdaten.anbieter, "modell": self.stammdaten.modell,
            "effort": self.stammdaten.effort, "arbeitskopie": self.stammdaten.arbeitskopie,
            "zustand": zustand, "liveZeile": self.live_zeile, "letzteZeilen": self.letzte_zeilen,
            "tokens": 0, "laufzeitSekunden": laufzeit, "fortschritt": 0,
            "phasen": [], "dateien": self.dateien, "tests": null, "schaetzung": null,
        })
    }
}
