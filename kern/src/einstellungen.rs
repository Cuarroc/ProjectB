//! Projekteinstellungen: stabile deutsche JSON-Schlüssel, Rückfall je einzelnem Feld.
use crate::start::{self, Berechtigung};
use serde_json::json;
pub use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex,
    },
};

macro_rules! auswahl {
    ($typ:ident, $standard:ident = $wert:literal $(, $variante:ident = $text:literal)*) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
        pub enum $typ { #[default] $standard, $($variante),* }
        impl $typ {
            fn lesen(v: &Value) -> Self {
                match v.as_str() {
                    Some($wert) => Self::$standard,
                    $(Some($text) => Self::$variante,)*
                    _ => Self::default(),
                }
            }
            fn text(self) -> &'static str {
                match self { Self::$standard => $wert, $(Self::$variante => $text),* }
            }
        }
    };
}
auswahl!(AgentenGleichzeitig, BisZu3 = "bisZu3", Einer = "einer", BisZu5 = "bisZu5");
auswahl!(PruefungDurch, AndereModellfamilie = "andereModellfamilie", GleicheFamilie = "gleicheFamilie");
auswahl!(Pruefrunden, Drei = "drei", Eins = "eins", Zwei = "zwei");
auswahl!(Plan, Normal = "normal", Kurz = "kurz", Ausfuehrlich = "ausfuehrlich");
auswahl!(Laenge, Mittel = "mittel", Kurz = "kurz", Ausfuehrlich = "ausfuehrlich");
auswahl!(AuftragFuer, Orchestrator = "orchestrator", Codex = "codex", Claude = "claude");
auswahl!(Schalter, An = "an", Aus = "aus");

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Ausfuehren {
    pub agenten_gleichzeitig: AgentenGleichzeitig,
    pub pruefung_durch: PruefungDurch,
    pub pruefrunden_hoechstens: Pruefrunden,
}
impl Ausfuehren {
    pub fn ist_empfohlen(&self) -> bool {
        self == &Self::default()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Planen {
    pub plan: Plan,
    pub dauer_und_tokens_schaetzen: Schalter,
    pub bei_unklarem_nachfragen: Schalter,
}
impl Planen {
    pub fn ist_empfohlen(&self) -> bool {
        self == &Self::default()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PromptBauen {
    pub laenge: Laenge,
    pub auftrag_fuer: AuftragFuer,
    pub abnahme_punkte_ergaenzen: Schalter,
}
impl PromptBauen {
    pub fn ist_empfohlen(&self) -> bool {
        self == &Self::default()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rolle {
    pub modell: String,
    pub effort: String,
}

impl Rolle {
    fn als_json(&self) -> Value {
        json!({"modell": self.modell, "effort": self.effort})
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reviewer {
    pub claude: Rolle,
    pub codex: Rolle,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rollen {
    pub orchestrator: Rolle,
    pub reviewer: Reviewer,
}

impl Default for Rollen {
    fn default() -> Self {
        let rolle = |modell: &str| Rolle { modell: modell.into(), effort: "Hoch".into() };
        Self {
            orchestrator: rolle("Opus 5.5"),
            reviewer: Reviewer { claude: rolle("Opus 5.5"), codex: rolle("gpt-6.1-sol") },
        }
    }
}

impl Rollen {
    fn uebernehmen(&mut self, v: &Value) {
        for (rolle, wert, familie) in [
            (&mut self.orchestrator, &v["orchestrator"], None),
            (&mut self.reviewer.claude, &v["reviewer"]["claude"], Some("claude")),
            (&mut self.reviewer.codex, &v["reviewer"]["codex"], Some("codex")),
        ] {
            if let Some(modell) = wert["modell"]
                .as_str()
                .filter(|m| start::modell(m).is_some_and(|(anbieter, _)| familie.is_none_or(|f| f == anbieter)))
            {
                rolle.modell = modell.into();
            }
            if let Some(effort) = wert["effort"].as_str().filter(|e| start::Effort::aus_text(e).is_some()) {
                rolle.effort = effort.into();
            }
        }
    }

    fn als_json(&self) -> Value {
        json!({"orchestrator": self.orchestrator.als_json(), "reviewer": {
            "claude": self.reviewer.claude.als_json(), "codex": self.reviewer.codex.als_json()
        }})
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Einstellungen {
    pub rollen: Rollen,
    pub berechtigung: Berechtigung,
    pub ausfuehren: Ausfuehren,
    pub planen: Planen,
    pub prompt_bauen: PromptBauen,
}

/// Fehlende/unlesbare Dateien und ungültiges JSON liefern die Empfehlungen.
/// Fehlende, unbekannte oder falsch typisierte Werte fallen einzeln zurück.
pub fn laden(pfad: impl AsRef<Path>) -> Einstellungen {
    let v: Value = fs::read(pfad).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    aus_json(&v)
}

/// Ändert nur übergebene Felder; Lesefehler außer „fehlt“ verhindern jedes Schreiben.
pub fn aendern(pfad: impl AsRef<Path>, aenderung: &Value) -> io::Result<Einstellungen> {
    static SPERRE: Mutex<()> = Mutex::new(());
    let _sperre = SPERRE.lock().map_err(|_| io::Error::other("Einstellungssperre beschädigt"))?;
    let pfad = pfad.as_ref();
    let basis = match fs::read(pfad) {
        Ok(daten) => serde_json::from_slice(&daten).unwrap_or_default(),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Value::Null,
        Err(e) => return Err(e),
    };
    let mut werte = als_json(&aus_json(&basis));
    for modus in ["ausfuehren", "planen", "prompt_bauen"] {
        if let (Some(ziel), Some(delta)) = (werte[modus].as_object_mut(), aenderung[modus].as_object()) {
            for (feld, wert) in delta {
                if let Some(alt) = ziel.get_mut(feld) {
                    *alt = wert.clone();
                }
            }
        }
    }
    if let Some(stufe) = aenderung["berechtigung"].as_str().and_then(Berechtigung::aus_text) {
        werte["berechtigung"] = json!(stufe.text());
    }
    let mut werte = aus_json(&werte);
    werte.rollen.uebernehmen(&aenderung["rollen"]);
    speichern(pfad, &werte)?;
    Ok(werte)
}

/// Liest dieselben Schlüssel und Rückfallwerte wie die Einstellungsdatei.
pub fn aus_json(v: &Value) -> Einstellungen {
    let a = &v["ausfuehren"];
    let p = &v["planen"];
    let b = &v["prompt_bauen"];
    let mut rollen = Rollen::default();
    rollen.uebernehmen(&v["rollen"]);
    Einstellungen {
        rollen,
        berechtigung: v["berechtigung"].as_str().and_then(Berechtigung::aus_text).unwrap_or_default(),
        ausfuehren: Ausfuehren {
            agenten_gleichzeitig: AgentenGleichzeitig::lesen(&a["agentenGleichzeitig"]),
            pruefung_durch: PruefungDurch::lesen(&a["pruefungDurch"]),
            pruefrunden_hoechstens: Pruefrunden::lesen(&a["pruefrundenHoechstens"]),
        },
        prompt_bauen: PromptBauen {
            laenge: Laenge::lesen(&b["laenge"]),
            auftrag_fuer: AuftragFuer::lesen(&b["auftragFuer"]),
            abnahme_punkte_ergaenzen: Schalter::lesen(&b["abnahmePunkteErgaenzen"]),
        },
        planen: Planen {
            plan: Plan::lesen(&p["plan"]),
            dauer_und_tokens_schaetzen: Schalter::lesen(&p["dauerUndTokensSchaetzen"]),
            bei_unklarem_nachfragen: Schalter::lesen(&p["beiUnklaremNachfragen"]),
        },
    }
}

/// Gibt die stabilen deutschen Schlüssel und Werte für Datei und Tauri zurück.
pub fn als_json(e: &Einstellungen) -> Value {
    let a = &e.ausfuehren;
    let p = &e.planen;
    let b = &e.prompt_bauen;
    json!({
        "rollen": e.rollen.als_json(),
        "berechtigung": e.berechtigung.text(),
        "ausfuehren": {
            "agentenGleichzeitig": a.agenten_gleichzeitig.text(),
            "pruefungDurch": a.pruefung_durch.text(),
            "pruefrundenHoechstens": a.pruefrunden_hoechstens.text()
        },
        "prompt_bauen": {
            "laenge": b.laenge.text(),
            "auftragFuer": b.auftrag_fuer.text(),
            "abnahmePunkteErgaenzen": b.abnahme_punkte_ergaenzen.text()
        },
        "planen": {
            "plan": p.plan.text(),
            "dauerUndTokensSchaetzen": p.dauer_und_tokens_schaetzen.text(),
            "beiUnklaremNachfragen": p.bei_unklarem_nachfragen.text()
        }
    })
}

/// Stabiler FNV-1a-64-Dateiname im App-Datenordner, ohne Zugriff aufs Projekt.
pub fn datei_fuer(ordner: &Path, projektpfad: &str) -> PathBuf {
    ordner.join("einstellungen").join(dateiname(projektpfad))
}

pub(crate) fn dateiname(projektpfad: &str) -> String {
    let pfad = crate::projekt::schluessel(projektpfad);
    let hash =
        pfad.bytes().fold(0xcbf29ce484222325u64, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3));
    format!("{hash:016x}.json")
}

/// Schreibt und synchronisiert eine neue Nachbardatei und ersetzt dann das Ziel.
/// Bei Fehlern bleibt das bisherige Ziel erhalten; sein Ordner muss existieren.
pub fn speichern(pfad: impl AsRef<Path>, e: &Einstellungen) -> io::Result<()> {
    let pfad = pfad.as_ref();
    let name = pfad.file_name().ok_or_else(|| io::Error::other("Dateiname fehlt"))?;
    let daten = serde_json::to_vec_pretty(&als_json(e))?;
    static NR: AtomicUsize = AtomicUsize::new(0);
    let (temp, mut datei) = loop {
        let mut temp_name = name.to_os_string();
        temp_name.push(format!(".{}-{}.tmp", std::process::id(), NR.fetch_add(1, Ordering::Relaxed)));
        let temp = pfad.with_file_name(temp_name);
        match OpenOptions::new().write(true).create_new(true).open(&temp) {
            Ok(datei) => break (temp, datei),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    };
    let ergebnis = (|| {
        datei.write_all(&daten)?;
        datei.sync_all()?;
        drop(datei);
        fs::rename(&temp, pfad)
    })();
    if ergebnis.is_err() {
        let _ = fs::remove_file(&temp);
    }
    ergebnis
}
