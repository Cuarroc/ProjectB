use crate::{start, verbrauch, Anbieter, Ereignis};
use std::{io, path::Path};

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
    let mut letzter_text = None;
    for e in &lauf.ereignisse {
        match &e {
            Ereignis::Sitzung(id) => antwort.sitzung = Some(id.clone()),
            Ereignis::Kontingent(stand) => {
                if let Some(datei) = kontingent {
                    let _ = verbrauch::merken(datei, anbieter.name, stand);
                }
            }
            Ereignis::Beendet { erfolg, .. } => antwort.erfolg = *erfolg,
            _ => {}
        }
        if let Some(text) = chat_text(&e, letzter_text.as_deref()) {
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
        Ereignis::Beendet { erfolg: false, code }
            if !letzter_text.is_some_and(|t| t.starts_with("Der Auftrag ist fehlgeschlagen")) =>
        {
            Some(format!(
                "Der Auftrag ist fehlgeschlagen (Exit-Code: {}).",
                code.map_or_else(|| "unbekannt".into(), |c| c.to_string())
            ))
        }
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
