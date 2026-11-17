use crate::{start, verbrauch, Anbieter, Ereignis};
use std::{io, path::Path};

const PLANEN_ROLLE: &str = "Erstelle nur einen Plan. Ändere keine Dateien. Höchstens 3 Teilaufgaben, \
    jede mit Abnahme-Kriterien (\"Fertig, wenn …\"). Frage am Ende, ob der Plan freigegeben \
    oder mit Kommentaren zurückgegeben wird. Schreibe Teilaufgaben als Aufgabenliste (- [ ] …).";
const INTERVIEW_ROLLE: &str = "Stelle genau eine Frage pro Antwort, wenn möglich mit 2–4 kurzen \
    Antwortvorschlägen als Liste. Frage weiter, bis du sicher bist. Fasse dann den Auftrag zusammen \
    und bitte um Bestätigung. Ändere keine Dateien.";

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
        _ => return Err(format!("Unbekannter Modus: {modus}")),
    };
    let fortsetzen = sitzung
        .filter(|(_, alt, ort)| alt.eq_ignore_ascii_case(anbieter.name) && *ort == pfad)
        .map(|(id, _, _)| id.to_owned());
    Ok((
        anbieter,
        start::Startwunsch {
            berechtigung: Default::default(),
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
