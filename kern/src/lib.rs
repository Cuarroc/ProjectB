//! Kern von ProjectB: startet Coding-Agenten ohne Terminal, liest ihre
//! JSON-Ereignisse live und kann sie anhalten (Technik-Probe, Schritt 3).

use serde_json::Value;
use std::fmt;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::thread;

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
    /// Zeile auf der Fehlerausgabe, z. B. „nicht angemeldet“.
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
            zusammenfassung: text(v, "/result").unwrap_or_default(),
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
            Some("command_execution") | Some("reasoning") => vec![],
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

/// Ein laufender Agent.
pub struct Lauf {
    kind: Child,
    pub ereignisse: Receiver<Ereignis>,
}

impl Lauf {
    pub fn starten(a: &Anbieter, auftrag: &str, ordner: &Path) -> io::Result<Lauf> {
        let mut befehl = Command::new(finde_programm(a.programm));
        befehl.args(a.argumente).current_dir(ordner);
        befehl.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        ohne_fenster(&mut befehl);
        let mut kind = befehl.spawn()?;
        kind.stdin.take().expect("stdin").write_all(auftrag.as_bytes())?;
        let (tx, rx) = channel();
        let lesen = a.lesen;
        mitlesen(kind.stdout.take().expect("stdout"), tx.clone(), move |zeile| {
            serde_json::from_str(zeile).map(|v| lesen(&v)).unwrap_or_default()
        });
        mitlesen(kind.stderr.take().expect("stderr"), tx, |zeile| vec![Ereignis::Meldung(zeile.into())]);
        Ok(Lauf { kind, ereignisse: rx })
    }

    /// Hält den Agenten samt allen Unterprozessen an.
    pub fn anhalten(&mut self) -> io::Result<()> {
        if self.kind.try_wait()?.is_none() {
            #[cfg(windows)]
            {
                // Ein .cmd-Starter startet node als Kind: den ganzen Baum beenden (LEHREN.md).
                let mut t = Command::new("taskkill");
                t.args(["/T", "/F", "/PID", &self.kind.id().to_string()]);
                ohne_fenster(t.stdout(Stdio::null()).stderr(Stdio::null()));
                // Exit-Code nicht verstecken: scheitert taskkill (z. B. keine Rechte) und läuft
                // der Agent noch, nie unbegrenzt warten, sondern den Agenten selbst beenden und melden.
                if !t.status()?.success() && self.kind.try_wait()?.is_none() {
                    self.kind.kill()?;
                    self.kind.wait()?;
                    return Err(io::Error::other("taskkill gescheitert; Unterprozesse laufen evtl. weiter"));
                }
            }
            #[cfg(not(windows))]
            self.kind.kill()?;
        }
        self.kind.wait().map(|_| ())
    }

    pub fn warten(&mut self) -> io::Result<ExitStatus> {
        self.kind.wait()
    }
}

fn mitlesen(
    quelle: impl Read + Send + 'static,
    tx: Sender<Ereignis>,
    lesen: impl Fn(&str) -> Vec<Ereignis> + Send + 'static,
) {
    thread::spawn(move || {
        for zeile in BufReader::new(quelle).lines().map_while(Result::ok) {
            for e in lesen(zeile.trim()) {
                if tx.send(e).is_err() {
                    return;
                }
            }
        }
    });
}

/// Unter Windows liegen die Agenten oft als `name.cmd` im PATH; Rust findet sonst nur `.exe`.
fn finde_programm(name: &str) -> PathBuf {
    if cfg!(windows) {
        for ordner in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
            for endung in ["exe", "cmd", "bat"] {
                let pfad = ordner.join(format!("{name}.{endung}"));
                if pfad.is_file() {
                    return pfad;
                }
            }
        }
    }
    PathBuf::from(name)
}

#[cfg(windows)]
fn ohne_fenster(befehl: &mut Command) {
    use std::os::windows::process::CommandExt;
    befehl.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: kein aufblitzendes Konsolenfenster
}

#[cfg(not(windows))]
fn ohne_fenster(_: &mut Command) {}

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
    }

    #[test]
    fn codex_zeilen() {
        let befehl = json!({"type":"item.started","item":{"type":"command_execution","command":"ls"}});
        assert_eq!(lies_codex(&befehl), vec![Ereignis::Werkzeug("ls".into())]);
        let antwort = json!({"type":"item.completed","item":{"type":"agent_message","text":"Fertig"}});
        assert_eq!(lies_codex(&antwort), vec![Ereignis::Text("Fertig".into())]);
        let fehler = json!({"type":"turn.failed","error":{"message":"Limit"}});
        assert_eq!(lies_codex(&fehler), vec![Ereignis::Fertig { erfolg: false, zusammenfassung: "Limit".into() }]);
    }
}
