//! Kern von ProjectB: startet Coding-Agenten ohne Terminal, liest ihre
//! JSON-Ereignisse live und kann sie anhalten (Technik-Probe, Schritt 3).
//! Dieser Teil: Ereignisse und Anbieter; Starten und Anhalten folgt im nächsten PR.

use serde_json::Value;
use std::fmt;

/// Was ein Agent gerade tut.
#[derive(Debug, Clone, PartialEq)]
pub enum Ereignis {
    Gestartet {
        modell: Option<String>,
    },
    Text(String),
    Werkzeug(String),
    Fertig {
        erfolg: bool,
        zusammenfassung: String,
    },
    /// Hinweis: Zeile auf der Fehlerausgabe (z. B. „nicht angemeldet“) oder ein Befehl, der scheiterte.
    Meldung(String),
    Unbekannt(String),
}

/// Ein Anbieter. Ein neuer Anbieter ist ein neuer Eintrag plus eine Lese-Funktion.
pub struct Anbieter {
    pub name: &'static str,
    pub programm: &'static str,
    /// Der Auftrag kommt immer über die Standardeingabe, nie als Argument:
    /// so gibt es unter Windows keine Probleme mit Anführungszeichen.
    pub argumente: &'static [&'static str],
    pub lesen: fn(&Value) -> Vec<Ereignis>,
}

pub static CLAUDE: Anbieter = Anbieter {
    name: "claude",
    programm: "claude",
    argumente: &["-p", "--output-format", "stream-json", "--verbose"],
    lesen: lies_claude,
};

pub static CODEX: Anbieter =
    Anbieter { name: "codex", programm: "codex", argumente: &["exec", "--json", "-"], lesen: lies_codex };

pub fn anbieter(name: &str) -> Option<&'static Anbieter> {
    [&CLAUDE, &CODEX].into_iter().find(|a| a.name == name)
}

fn text(v: &Value, zeiger: &str) -> Option<String> {
    v.pointer(zeiger).and_then(Value::as_str).map(str::to_owned)
}

pub fn lies_claude(v: &Value) -> Vec<Ereignis> {
    match v.get("type").and_then(Value::as_str) {
        Some("system") if text(v, "/subtype").as_deref() == Some("init") => {
            vec![Ereignis::Gestartet { modell: text(v, "/model") }]
        }
        Some("system") | Some("user") => vec![],
        Some("assistant") => v
            .pointer("/message/content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|teil| match teil.get("type")?.as_str()? {
                "text" => Some(Ereignis::Text(text(teil, "/text")?)),
                "tool_use" => Some(Ereignis::Werkzeug(text(teil, "/name")?)),
                _ => None,
            })
            .collect(),
        Some("result") => vec![Ereignis::Fertig {
            erfolg: v.get("is_error").and_then(Value::as_bool) == Some(false),
            // Bei Abbrüchen (error_during_execution, error_max_turns) steht der Grund in `errors`.
            zusammenfassung: text(v, "/result").unwrap_or_else(|| {
                let fehler = v.get("errors").and_then(Value::as_array).into_iter().flatten();
                fehler.filter_map(Value::as_str).collect::<Vec<_>>().join("; ")
            }),
        }],
        andere => vec![Ereignis::Unbekannt(andere.unwrap_or("ohne type").into())],
    }
}

pub fn lies_codex(v: &Value) -> Vec<Ereignis> {
    let art = text(v, "/item/type");
    match v.get("type").and_then(Value::as_str) {
        Some("thread.started") => vec![Ereignis::Gestartet { modell: None }],
        Some("turn.started") | Some("item.updated") => vec![],
        Some("item.started") if art.as_deref() == Some("command_execution") => {
            vec![Ereignis::Werkzeug(text(v, "/item/command").unwrap_or_default())]
        }
        Some("item.started") => vec![],
        Some("item.completed") => match art.as_deref() {
            Some("agent_message") => vec![Ereignis::Text(text(v, "/item/text").unwrap_or_default())],
            Some("command_execution") => match v.pointer("/item/exit_code").and_then(Value::as_i64) {
                Some(code) if code != 0 => vec![Ereignis::Meldung(format!(
                    "`{}` endete mit Exit-Code {code}",
                    text(v, "/item/command").unwrap_or_default()
                ))],
                _ => vec![],
            },
            Some("reasoning") => vec![],
            Some(andere) => vec![Ereignis::Werkzeug(andere.into())],
            None => vec![],
        },
        Some("turn.completed") => vec![Ereignis::Fertig { erfolg: true, zusammenfassung: String::new() }],
        Some("turn.failed") | Some("error") => vec![Ereignis::Fertig {
            erfolg: false,
            zusammenfassung: text(v, "/error/message").or_else(|| text(v, "/message")).unwrap_or_default(),
        }],
        andere => vec![Ereignis::Unbekannt(andere.unwrap_or("ohne type").into())],
    }
}

impl fmt::Display for Ereignis {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let kurz = |s: &str| s.chars().take(160).collect::<String>().replace('\n', " ");
        match self {
            Ereignis::Gestartet { modell } => {
                write!(f, "bereit (Modell: {})", modell.as_deref().unwrap_or("unbekannt"))
            }
            Ereignis::Text(t) => write!(f, "sagt: {}", kurz(t)),
            Ereignis::Werkzeug(w) => write!(f, "benutzt: {}", kurz(w)),
            Ereignis::Fertig { erfolg: true, zusammenfassung } => write!(f, "fertig: {}", kurz(zusammenfassung)),
            Ereignis::Fertig { erfolg: false, zusammenfassung } => write!(f, "PROBLEM: {}", kurz(zusammenfassung)),
            Ereignis::Meldung(m) => write!(f, "Meldung: {}", kurz(m)),
            Ereignis::Unbekannt(art) => write!(f, "unbekanntes Ereignis: {art}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn claude_zeilen() {
        let init = json!({"type":"system","subtype":"init","model":"m"});
        assert_eq!(lies_claude(&init), vec![Ereignis::Gestartet { modell: Some("m".into()) }]);
        let antwort = json!({"type":"assistant","message":{"content":[{"type":"text","text":"Hallo"},{"type":"tool_use","name":"Read"}]}});
        assert_eq!(lies_claude(&antwort), vec![Ereignis::Text("Hallo".into()), Ereignis::Werkzeug("Read".into())]);
        let fehler = json!({"type":"result","is_error":true,"result":"kaputt"});
        assert_eq!(lies_claude(&fehler), vec![Ereignis::Fertig { erfolg: false, zusammenfassung: "kaputt".into() }]);
        assert_eq!(lies_claude(&json!({"type":"neu"})), vec![Ereignis::Unbekannt("neu".into())]);
        let abbruch =
            json!({"type":"result","subtype":"error_during_execution","is_error":true,"errors":["Limit","weg"]});
        assert_eq!(
            lies_claude(&abbruch),
            vec![Ereignis::Fertig { erfolg: false, zusammenfassung: "Limit; weg".into() }]
        );
    }

    #[test]
    fn codex_zeilen() {
        let befehl = json!({"type":"item.started","item":{"type":"command_execution","command":"ls"}});
        assert_eq!(lies_codex(&befehl), vec![Ereignis::Werkzeug("ls".into())]);
        let antwort = json!({"type":"item.completed","item":{"type":"agent_message","text":"Fertig"}});
        assert_eq!(lies_codex(&antwort), vec![Ereignis::Text("Fertig".into())]);
        let fehler = json!({"type":"turn.failed","error":{"message":"Limit"}});
        assert_eq!(lies_codex(&fehler), vec![Ereignis::Fertig { erfolg: false, zusammenfassung: "Limit".into() }]);
        let rot =
            json!({"type":"item.completed","item":{"type":"command_execution","command":"cargo test","exit_code":101}});
        assert_eq!(lies_codex(&rot), vec![Ereignis::Meldung("`cargo test` endete mit Exit-Code 101".into())]);
        let gruen = json!({"type":"item.completed","item":{"type":"command_execution","command":"ls","exit_code":0}});
        assert_eq!(lies_codex(&gruen), vec![]);
    }
}
