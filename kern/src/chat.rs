use crate::Ereignis;

/// Sichtbare Chat-Antworten ohne doppelte Erfolgsmeldungen.
pub fn chat_text(e: &Ereignis) -> Option<String> {
    match e {
        Ereignis::Text(t) => Some(t.clone()),
        Ereignis::Fertig { erfolg: false, zusammenfassung } => Some(if zusammenfassung.is_empty() {
            "Der Auftrag ist fehlgeschlagen.".into()
        } else {
            format!("Der Auftrag ist fehlgeschlagen: {zusammenfassung}")
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::chat_text;
    use crate::{verbrauch::Stand, Ereignis};

    #[test]
    fn text_und_problem_erscheinen_im_chat() {
        assert_eq!(chat_text(&Ereignis::Text("Hallo\nWelt".into())), Some("Hallo\nWelt".into()));
        assert_eq!(
            chat_text(&Ereignis::Fertig { erfolg: false, zusammenfassung: "Limit erreicht".into() }),
            Some("Der Auftrag ist fehlgeschlagen: Limit erreicht".into())
        );
        assert_eq!(
            chat_text(&Ereignis::Fertig { erfolg: false, zusammenfassung: String::new() }),
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
            assert_eq!(chat_text(&e), None, "{e:?}");
        }
    }
}
