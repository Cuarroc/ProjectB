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
        Some("rate_limit_event") => vec![Ereignis::Meldung("Hinweis zum Kontingent".into())],
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
            Some("error") => vec![Ereignis::Meldung(text(v, "/item/message").unwrap_or_default())],
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
    #[cfg(windows)]
    job: std::sync::Arc<job::Griff>,
    pub ereignisse: Receiver<Ereignis>,
}

impl Lauf {
    pub fn starten(a: &Anbieter, auftrag: &str, ordner: &Path) -> io::Result<Lauf> {
        let mut befehl = Command::new(finde_programm(a.programm));
        befehl.args(a.argumente).current_dir(ordner);
        befehl.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        let (tx, rx) = channel();
        #[cfg(windows)]
        let (mut kind, job) = job::starten(&mut befehl, tx.clone())?;
        #[cfg(not(windows))]
        let mut kind = befehl.spawn()?;
        let lesen = a.lesen;
        mitlesen(kind.stdout.take().expect("stdout"), tx.clone(), move |zeile| {
            serde_json::from_str(zeile).map(|v| lesen(&v)).unwrap_or_default()
        });
        mitlesen(kind.stderr.take().expect("stderr"), tx.clone(), |zeile| vec![Ereignis::Meldung(zeile.into())]);
        // Erst lesen, dann schreiben, und zwar in einem eigenen Thread: ein großer Auftrag füllt sonst die
        // Pipe, während der Agent auf seine volle Ausgabe wartet. Danach ist stdin zu (Ende des Auftrags).
        let (mut stdin, auftrag) = (kind.stdin.take().expect("stdin"), auftrag.to_owned());
        thread::spawn(move || {
            if let Err(e) = stdin.write_all(auftrag.as_bytes()) {
                let _ = tx.send(Ereignis::Meldung(format!("Auftrag nicht vollständig übergeben: {e}")));
            }
        });
        Ok(Lauf {
            kind,
            #[cfg(windows)]
            job,
            ereignisse: rx,
        })
    }

    /// Hält den Agenten samt allen Unterprozessen an.
    pub fn anhalten(&mut self) -> io::Result<()> {
        // Den ganzen Job beenden, auch wenn der Agent selbst schon fertig ist: verwaiste Enkel
        // hängen nicht mehr im Prozessbaum, sind aber im Job (LEHREN.md).
        #[cfg(windows)]
        if let Err(e) = job::beenden(&self.job) {
            // Exit-Code nicht verstecken: nie unbegrenzt warten, sondern den Agenten selbst beenden und melden.
            // Scheitert auch das, bleibt der Job-Fehler `e` in der Meldung.
            let agent = match self.kind.try_wait() {
                Ok(Some(_)) => Ok(()),
                _ => self.kind.kill().and_then(|_| self.kind.wait().map(|_| ())),
            };
            let agent = agent.err().map(|f| format!(", Agent nicht beendet ({f})")).unwrap_or_default();
            return Err(io::Error::other(format!("Job nicht beendet ({e}){agent}; Unterprozesse laufen evtl. weiter")));
        }
        #[cfg(not(windows))]
        if self.kind.try_wait()?.is_none() {
            self.kind.kill()?;
        }
        self.kind.wait().map(|_| ())
    }

    /// Prozessnummer des Agenten, z. B. um nach dem Anhalten gezielt nach Resten zu suchen.
    pub fn pid(&self) -> u32 {
        self.kind.id()
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

/// Unter Windows läuft jeder Agent in einem eigenen Job-Objekt: so lassen sich auch Unterprozesse beenden,
/// deren Eltern schon weg sind (z. B. ein `git clone`, den Codex nebenbei startet).
#[cfg(windows)]
mod job {
    use super::Ereignis;
    use std::io;
    use std::os::windows::io::AsRawHandle;
    use std::os::windows::process::CommandExt;
    use std::process::{Child, Command};
    use std::sync::{mpsc::Sender, Arc};
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE, WAIT_OBJECT_0};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::*;
    use windows_sys::Win32::System::JobObjects::*;
    use windows_sys::Win32::System::Threading::*;

    /// Ein Windows-Handle, das beim Fallenlassen geschlossen wird.
    pub struct Griff(HANDLE);
    // Sicher: ein Kernel-Handle gilt prozessweit, in jedem Thread.
    unsafe impl Send for Griff {}
    unsafe impl Sync for Griff {}

    impl Griff {
        fn neu(h: HANDLE) -> io::Result<Griff> {
            if h.is_null() || h == INVALID_HANDLE_VALUE {
                return Err(io::Error::last_os_error());
            }
            Ok(Griff(h))
        }
    }

    impl Drop for Griff {
        fn drop(&mut self) {
            unsafe { CloseHandle(self.0) };
        }
    }

    fn ok(r: i32) -> io::Result<()> {
        if r == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }

    pub fn beenden(job: &Griff) -> io::Result<()> {
        ok(unsafe { TerminateJobObject(job.0, 1) })
    }

    /// Startet den Agenten angehalten, steckt ihn in einen neuen Job und lässt ihn erst dann laufen:
    /// so ist schon sein erster Unterprozess im Job.
    pub fn starten(befehl: &mut Command, tx: Sender<Ereignis>) -> io::Result<(Child, Arc<Griff>)> {
        befehl.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED); // kein aufblitzendes Konsolenfenster
        let mut kind = befehl.spawn()?;
        match unsafe { einrichten(&kind, tx) } {
            Ok(job) => Ok((kind, job)),
            Err(e) => {
                let _ = kind.kill(); // sonst bliebe ein angehaltener Prozess liegen; gemeldet wird `e`
                Err(e)
            }
        }
    }

    unsafe fn einrichten(kind: &Child, tx: Sender<Ereignis>) -> io::Result<Arc<Griff>> {
        let job = Arc::new(Griff::neu(CreateJobObjectW(std::ptr::null(), std::ptr::null()))?);
        // Wird der Lauf fallen gelassen, schließt das Handle und Windows beendet alles im Job.
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let groesse = size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32;
        ok(SetInformationJobObject(job.0, JobObjectExtendedLimitInformation, &raw const info as _, groesse))?;
        ok(AssignProcessToJobObject(job.0, kind.as_raw_handle()))?;
        // Endet der Agent von selbst, beendet ein Wächter die Reste im Job. Sonst hielten verwaiste
        // Enkel die Ausgabe-Pipes offen, und der Lauf endete erst mit ihnen.
        let prozess = Griff::neu(OpenProcess(PROCESS_SYNCHRONIZE, 0, kind.id()))?;
        let schwach = Arc::downgrade(&job);
        std::thread::spawn(move || {
            let prozess = &prozess; // den ganzen Griff mitnehmen, nicht nur das rohe Handle
            let fehler = if WaitForSingleObject(prozess.0, INFINITE) != WAIT_OBJECT_0 {
                Some(io::Error::last_os_error())
            } else {
                schwach.upgrade().and_then(|job| beenden(&job).err())
            };
            if let Some(e) = fehler {
                let _ = tx.send(Ereignis::Meldung(format!("Reste des Agenten nicht beendet: {e}")));
            }
        });
        fortsetzen(kind.id())?;
        Ok(job)
    }

    /// Lässt den angehaltenen Prozess laufen. `std` gibt sein Thread-Handle nicht heraus, darum über die Thread-Liste.
    unsafe fn fortsetzen(pid: u32) -> io::Result<()> {
        let liste = Griff::neu(CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0))?;
        let mut t: THREADENTRY32 = std::mem::zeroed();
        t.dwSize = size_of::<THREADENTRY32>() as u32;
        let mut gefunden = false;
        let mut weiter = Thread32First(liste.0, &mut t);
        while weiter != 0 {
            if t.th32OwnerProcessID == pid {
                let faden = Griff::neu(OpenThread(THREAD_SUSPEND_RESUME, 0, t.th32ThreadID))?;
                if ResumeThread(faden.0) == u32::MAX {
                    return Err(io::Error::last_os_error());
                }
                gefunden = true;
            }
            weiter = Thread32Next(liste.0, &mut t);
        }
        if !gefunden {
            return Err(io::Error::other(format!("kein Thread von Prozess {pid} gefunden")));
        }
        Ok(())
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
            Ereignis::Fertig { erfolg: true, zusammenfassung } if zusammenfassung.is_empty() => write!(f, "fertig"),
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
        // Beobachtet in der Probe auf Windows (PR #2): Kontingent-Hinweis von Claude.
        let kontingent = json!({"type":"rate_limit_event"});
        assert_eq!(lies_claude(&kontingent), vec![Ereignis::Meldung("Hinweis zum Kontingent".into())]);
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
        // Beobachtet in der Probe auf Windows (PR #2): Fehler-Einträge sind kein Werkzeug.
        let fehler_eintrag = json!({"type":"item.completed","item":{"type":"error","message":"Skill fehlt"}});
        assert_eq!(lies_codex(&fehler_eintrag), vec![Ereignis::Meldung("Skill fehlt".into())]);
    }
}
