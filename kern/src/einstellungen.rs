//! Projekteinstellungen: stabile deutsche JSON-Schlüssel, Rückfall je einzelnem Feld.
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
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
pub struct Einstellungen {
    pub ausfuehren: Ausfuehren,
    pub planen: Planen,
}

/// Fehlende/unlesbare Dateien und ungültiges JSON liefern die Empfehlungen.
/// Fehlende, unbekannte oder falsch typisierte Werte fallen einzeln zurück.
pub fn laden(pfad: impl AsRef<Path>) -> Einstellungen {
    let v: Value = fs::read(pfad).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    let a = &v["ausfuehren"];
    let p = &v["planen"];
    Einstellungen {
        ausfuehren: Ausfuehren {
            agenten_gleichzeitig: AgentenGleichzeitig::lesen(&a["agentenGleichzeitig"]),
            pruefung_durch: PruefungDurch::lesen(&a["pruefungDurch"]),
            pruefrunden_hoechstens: Pruefrunden::lesen(&a["pruefrundenHoechstens"]),
        },
        planen: Planen {
            plan: Plan::lesen(&p["plan"]),
            dauer_und_tokens_schaetzen: Schalter::lesen(&p["dauerUndTokensSchaetzen"]),
            bei_unklarem_nachfragen: Schalter::lesen(&p["beiUnklaremNachfragen"]),
        },
    }
}

/// Schreibt und synchronisiert eine neue Nachbardatei und ersetzt dann das Ziel.
/// Bei Fehlern bleibt das bisherige Ziel erhalten; sein Ordner muss existieren.
pub fn speichern(pfad: impl AsRef<Path>, e: &Einstellungen) -> io::Result<()> {
    let pfad = pfad.as_ref();
    let name = pfad.file_name().ok_or_else(|| io::Error::other("Dateiname fehlt"))?;
    let a = &e.ausfuehren;
    let p = &e.planen;
    let daten = serde_json::to_vec_pretty(&json!({
        "ausfuehren": {
            "agentenGleichzeitig": a.agenten_gleichzeitig.text(),
            "pruefungDurch": a.pruefung_durch.text(),
            "pruefrundenHoechstens": a.pruefrunden_hoechstens.text()
        },
        "planen": {
            "plan": p.plan.text(),
            "dauerUndTokensSchaetzen": p.dauer_und_tokens_schaetzen.text(),
            "beiUnklaremNachfragen": p.bei_unklarem_nachfragen.text()
        }
    }))?;
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
