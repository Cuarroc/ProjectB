use crate::{start, verbrauch, Anbieter, Ereignis};
use std::{io, path::Path};

const PLANEN_ROLLE: &str = "Erstelle nur einen Plan. Ändere keine Dateien. Höchstens 3 Teilaufgaben, \
    jede mit Abnahme-Kriterien (\"Fertig, wenn …\"). Frage am Ende, ob der Plan freigegeben \
    oder mit Kommentaren zurückgegeben wird. Schreibe Teilaufgaben als Aufgabenliste (- [ ] …). \
    Schreibe unter jede Teilaufgabe die Zeilen Dauer: ~N min, Tokens: ~Nk und Risiko: Niedrig|Mittel|Hoch.";
const INTERVIEW_ROLLE: &str = "Stelle genau eine Frage pro Antwort, wenn möglich mit 2–4 kurzen \
    Antwortvorschlägen als Liste. Frage weiter, bis du sicher bist. Fasse dann den Auftrag zusammen \
    und bitte um Bestätigung. Ändere keine Dateien.";
const PROMPT_ROLLE: &str = "Mach aus den Stichworten einen ausführlichen Auftrag für einen Coding-Agenten. \
    Ändere keine Dateien. Fehlt etwas Wichtiges, stelle genau EINE Rückfrage, wenn möglich mit \
    2–4 kurzen Antwortvorschlägen als Liste. Beende die Antwort dann mit dieser Liste (- …), ohne Text danach. \
    Sonst antworte NUR mit diesen fünf Abschnitten, in dieser Reihenfolge und mit genau diesen Überschriften: \
    \n## Ziel\n## Hintergrund\n## Was genau\n## Fertig, wenn\n## Nicht tun\n\
    Jede Überschrift steht auf einer eigenen Zeile. Unter Ziel steht ein Satz. \
    Unter Was genau und Fertig, wenn steht eine Liste, bei Fertig, wenn mit prüfbaren Punkten.";

pub fn prompt_rolle(e: &crate::einstellungen::PromptBauen) -> String {
    use crate::einstellungen::{AuftragFuer, Laenge, Schalter};
    let mut rolle = PROMPT_ROLLE.to_owned();
    for satz in [
        match e.laenge {
            Laenge::Kurz => "Halte jeden Abschnitt knapp, höchstens 2 Punkte.",
            Laenge::Ausfuehrlich => "Schreib jeden Abschnitt ausführlich.",
            Laenge::Mittel => "",
        },
        match e.auftrag_fuer {
            AuftragFuer::Codex => "Der Auftrag geht direkt an Codex, nicht an einen Orchestrator.",
            AuftragFuer::Claude => "Der Auftrag geht direkt an Claude, nicht an einen Orchestrator.",
            AuftragFuer::Orchestrator => "",
        },
        if e.abnahme_punkte_ergaenzen == Schalter::Aus {
            "Unter Fertig, wenn nur das, was der Nutzer selbst nennt."
        } else {
            ""
        },
    ]
    .into_iter()
    .filter(|s| !s.is_empty())
    {
        rolle.push(' ');
        rolle.push_str(satz);
    }
    rolle
}

pub fn startwunsch(
    modell: &str,
    effort: &str,
    modus: &str,
    sitzung: Option<(&str, &str, &str)>,
    pfad: &str,
    text: String,
) -> Result<(&'static Anbieter, start::Startwunsch), String> {
    let (name, cli_modell) = start::modell(modell).ok_or_else(|| format!("Unbekanntes Modell: {modell}"))?;
    let anbieter = crate::anbieter(name).ok_or_else(|| format!("Unbekannter Anbieter: {name}"))?;
    let effort = start::Effort::aus_text(effort).ok_or_else(|| format!("Unbekannter Effort: {effort}"))?;
    let rolle = match modus {
        "Ausführen" => None,
        "Planen" => Some(PLANEN_ROLLE.into()),
        "Interview" => Some(INTERVIEW_ROLLE.into()),
        "Prompt bauen" => Some(prompt_rolle(&Default::default())),
        _ => return Err(format!("Unbekannter Modus: {modus}")),
    };
    let fortsetzen = sitzung
        .filter(|(_, alt, ort)| alt.eq_ignore_ascii_case(anbieter.name) && *ort == pfad)
        .map(|(id, _, _)| id.to_owned());
    Ok((
        anbieter,
        start::Startwunsch {
            berechtigung: None,
            nur_lesen: rolle.is_some(),
            rolle,
            modell: Some(cli_modell.into()),
            effort: Some(effort),
            fortsetzen,
            auftrag: text,
        },
    ))
}

pub struct Antwort {
    pub sitzung: Option<String>,
    pub erfolg: bool,
}

impl Antwort {
    pub fn json(&self) -> serde_json::Value {
        serde_json::json!({"sitzung": self.sitzung, "erfolg": self.erfolg})
    }
}

pub fn ausfuehren(
    anbieter: &Anbieter,
    wunsch: &start::Startwunsch,
    ordner: &Path,
    kontingent: Option<&Path>,
    mut zeigen: impl FnMut(String),
) -> io::Result<Antwort> {
    let mut lauf = start::starten(anbieter, wunsch, ordner)?;
    let mut antwort = Antwort { sitzung: None, erfolg: false };
    let mut letzter_text: Option<String> = None;
    let mut fehler = String::new();
    let mut letzte_meldung = String::new();
    for e in &lauf.ereignisse {
        match &e {
            Ereignis::Sitzung(id) => antwort.sitzung = Some(id.clone()),
            Ereignis::Kontingent(stand) => {
                if let Some(datei) = kontingent {
                    let _ = verbrauch::merken(datei, anbieter.name, stand);
                }
            }
            Ereignis::Beendet { erfolg, .. } => antwort.erfolg = *erfolg,
            Ereignis::Meldung(m) => letzte_meldung = m.chars().take(300).collect(),
            Ereignis::Fertig { erfolg: false, zusammenfassung } => {
                fehler = zusammenfassung.clone();
                continue; // Erst Beendet liefert den verbindlichen Exit-Code.
            }
            _ => {}
        }
        if let Some(mut text) = chat_text(&e, letzter_text.as_deref()) {
            if matches!(e, Ereignis::Beendet { erfolg: false, .. }) {
                if letzter_text.as_deref().is_some_and(|t| t.trim() == fehler.trim()) {
                    fehler.clear();
                }
                for grund in [&fehler, &letzte_meldung].into_iter().filter(|t| !t.is_empty()) {
                    text.push_str(&format!(" {grund}"));
                }
            }
            zeigen(text.clone());
            letzter_text = Some(text);
        }
    }
    lauf.warten()?;
    Ok(antwort)
}

/// Sichtbare Chat-Antworten ohne doppelte Erfolgs- oder Fehlertexte.
/// Aufrufer geben den letzten angezeigten Text desselben Laufs mit, sonst `None`.
pub fn chat_text(e: &Ereignis, letzter_text: Option<&str>) -> Option<String> {
    match e {
        Ereignis::Text(t) => Some(t.clone()),
        Ereignis::Fertig { erfolg: false, zusammenfassung } => Some(
            if zusammenfassung.is_empty() || letzter_text.is_some_and(|text| text.trim() == zusammenfassung.trim()) {
                "Der Auftrag ist fehlgeschlagen.".into()
            } else {
                format!("Der Auftrag ist fehlgeschlagen: {zusammenfassung}")
            },
        ),
        Ereignis::Beendet { erfolg: false, code } => Some(format!(
            "Der Auftrag ist fehlgeschlagen (Exit-Code: {}).",
            code.map_or_else(|| "unbekannt".into(), |c| c.to_string())
        )),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::chat_text;
    use crate::{verbrauch::Stand, Ereignis};

    #[test]
    fn prompt_bauen_ist_lesend_und_verlangt_abschnitte_oder_rueckfrage() {
        for (modell, anbieter) in [("Opus 5.5", "claude"), ("gpt-6.1-sol", "codex")] {
            for sitzung in [None, Some(("id", anbieter, "projekt"))] {
                let (_, wunsch) =
                    super::startwunsch(modell, "Hoch", "Prompt bauen", sitzung, "projekt", "CSV-Export".into())
                        .unwrap();
                assert!(wunsch.nur_lesen);
                let rolle = wunsch.rolle.unwrap();
                for vorgabe in [
                    "Coding-Agenten",
                    "Ändere keine Dateien.",
                    "genau EINE Rückfrage",
                    "## Ziel",
                    "## Hintergrund",
                    "## Was genau",
                    "## Fertig, wenn",
                    "## Nicht tun",
                ] {
                    assert!(rolle.contains(vorgabe), "{vorgabe}");
                }
                for titel in ["Ziel", "Hintergrund", "Was genau", "Fertig, wenn", "Nicht tun"] {
                    let ueberschrift = format!("## {titel}");
                    let (_, danach) = rolle.split_once(&ueberschrift).unwrap();
                    assert!(danach.starts_with(['\n', ',', ' ']), "{ueberschrift}");
                    assert!(!danach.trim_start().starts_with('('), "{ueberschrift}");
                }
                let format = "2–4 kurzen Antwortvorschlägen als Liste.";
                assert!(super::INTERVIEW_ROLLE.contains(format));
                assert!(rolle.contains(format));
            }
        }
    }

    #[test]
    fn prompt_rolle_beachtet_einstellungen() {
        use crate::einstellungen::{aus_json, PromptBauen};
        let saetze = [
            "Halte jeden Abschnitt knapp, höchstens 2 Punkte.",
            "Der Auftrag geht direkt an Codex, nicht an einen Orchestrator.",
            "Unter Fertig, wenn nur das, was der Nutzer selbst nennt.",
        ];
        let e = aus_json(&serde_json::json!({"prompt_bauen": {
            "laenge": "kurz", "auftragFuer": "codex", "abnahmePunkteErgaenzen": "aus"
        }}));
        let rolle = super::prompt_rolle(&e.prompt_bauen);
        assert_eq!(rolle, format!("{} {}", super::PROMPT_ROLLE, saetze.join(" ")));
        assert_eq!(super::prompt_rolle(&PromptBauen::default()), super::PROMPT_ROLLE);
        let e = aus_json(&serde_json::json!({"prompt_bauen": {"laenge": "ausfuehrlich", "auftragFuer": "claude"}}));
        assert_eq!(super::prompt_rolle(&e.prompt_bauen), format!("{} Schreib jeden Abschnitt ausführlich. Der Auftrag geht direkt an Claude, nicht an einen Orchestrator.", super::PROMPT_ROLLE));
    }

    #[test]
    fn planen_fordert_risiko_und_aufwand_je_teilaufgabe() {
        for feld in ["Dauer: ~N min", "Tokens: ~Nk", "Risiko: Niedrig|Mittel|Hoch"] {
            assert!(super::PLANEN_ROLLE.contains(feld), "{feld}");
        }
    }

    #[test]
    fn gleicher_fehlertext_erscheint_nur_einmal() {
        for (letzter_text, zusammenfassung) in [
            ("Modell nicht verfügbar", "Modell nicht verfügbar"),
            ("\tModell nicht verfügbar\n", " \nModell nicht verfügbar\t"),
        ] {
            let text = chat_text(&Ereignis::Text(letzter_text.into()), None);
            assert_eq!(text.as_deref(), Some(letzter_text));
            assert_eq!(
                chat_text(
                    &Ereignis::Fertig { erfolg: false, zusammenfassung: zusammenfassung.into() },
                    text.as_deref()
                ),
                Some("Der Auftrag ist fehlgeschlagen.".into())
            );
        }
    }

    #[test]
    fn text_und_problem_erscheinen_im_chat() {
        assert_eq!(chat_text(&Ereignis::Text("Hallo\nWelt".into()), None), Some("Hallo\nWelt".into()));
        assert_eq!(
            chat_text(&Ereignis::Fertig { erfolg: false, zusammenfassung: "Limit erreicht".into() }, None),
            Some("Der Auftrag ist fehlgeschlagen: Limit erreicht".into())
        );
        assert_eq!(
            chat_text(
                &Ereignis::Fertig { erfolg: false, zusammenfassung: "Limit erreicht".into() },
                Some("Anderer Text")
            ),
            Some("Der Auftrag ist fehlgeschlagen: Limit erreicht".into())
        );
        assert_eq!(
            chat_text(&Ereignis::Fertig { erfolg: false, zusammenfassung: String::new() }, None),
            Some("Der Auftrag ist fehlgeschlagen.".into())
        );
    }

    #[test]
    fn andere_ereignisse_erscheinen_nicht_im_chat() {
        for e in [
            Ereignis::Gestartet { modell: None },
            Ereignis::Sitzung("id".into()),
            Ereignis::Werkzeug("Read".into()),
            Ereignis::Fertig { erfolg: true, zusammenfassung: "Schon als Text ausgegeben".into() },
            Ereignis::ErgebnisAusstehend,
            Ereignis::Beendet { code: Some(0), erfolg: true },
            Ereignis::Meldung("Hinweis".into()),
            Ereignis::Kontingent(Stand { prozent: 8, endet: 0 }),
            Ereignis::Unbekannt("neu".into()),
        ] {
            assert_eq!(chat_text(&e, None), None, "{e:?}");
        }
    }
}
