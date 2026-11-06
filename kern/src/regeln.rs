//! Reine Entscheidungen aus den Projekteinstellungen, ohne Prozesse oder Ein-/Ausgabe.
use crate::einstellungen::{AgentenGleichzeitig, Ausfuehren, Plan, Planen, Pruefrunden, PruefungDurch, Schalter};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Familie {
    Claude,
    Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Schritt {
    WeiterPruefen,
    Fertig,
    /// Die Rundengrenze ist erreicht: Der Orchestrator muss Elias fragen.
    Stopp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlanVorgaben {
    pub tiefe: Plan,
    pub schaetzen: bool,
    pub nachfragen: bool,
}

/// Ob neben den laufenden Agenten noch ein weiterer starten darf.
pub fn darf_starten(laufend: usize, e: &Ausfuehren) -> bool {
    let grenze = match e.agenten_gleichzeitig {
        AgentenGleichzeitig::Einer => 1,
        AgentenGleichzeitig::BisZu3 => 3,
        AgentenGleichzeitig::BisZu5 => 5,
    };
    laufend < grenze
}

pub fn pruefer_fuer(autor: Familie, e: &Ausfuehren) -> Familie {
    match e.pruefung_durch {
        PruefungDurch::GleicheFamilie => autor,
        PruefungDurch::AndereModellfamilie => match autor {
            Familie::Claude => Familie::Codex,
            Familie::Codex => Familie::Claude,
        },
    }
}

/// `runde` zählt abgeschlossene Prüfrunden (0 vor der ersten Prüfung).
/// Ohne offene Funde ist der Auftrag auch an oder über der Grenze fertig.
pub fn naechste_runde(runde: u8, offene_funde: bool, e: &Ausfuehren) -> Schritt {
    if !offene_funde {
        return Schritt::Fertig;
    }
    let grenze = match e.pruefrunden_hoechstens {
        Pruefrunden::Eins => 1,
        Pruefrunden::Zwei => 2,
        Pruefrunden::Drei => 3,
    };
    if runde >= grenze {
        Schritt::Stopp
    } else {
        Schritt::WeiterPruefen
    }
}

pub fn plan_vorgaben(e: &Planen) -> PlanVorgaben {
    PlanVorgaben {
        tiefe: e.plan,
        schaetzen: e.dauer_und_tokens_schaetzen == Schalter::An,
        nachfragen: e.bei_unklarem_nachfragen == Schalter::An,
    }
}
