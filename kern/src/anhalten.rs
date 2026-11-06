//! Hält Agenten an und sichert Arbeitskopien ohne Dateien zurückzusetzen.
use crate::Lauf;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const STANDARD_FRIST: Duration = Duration::from_secs(30);

#[derive(Debug, PartialEq, Eq)]
pub enum Ordnerstatus {
    Gesichert { sha: String },
    Sauber,
    Fehler { meldung: String },
}

#[derive(Debug)]
pub struct Ordnerbericht {
    pub ordner: PathBuf,
    pub status: Ordnerstatus,
}

#[derive(Debug)]
pub struct Bericht {
    pub ordner: Vec<Ordnerbericht>,
    /// Prozessnummer und Fehlermeldung jedes nicht erfolgreich angehaltenen Laufs.
    pub lauffehler: Vec<(u32, String)>,
    pub dauer: Duration,
    pub frist_ueberschritten: bool,
}

/// Die Frist ist eine Meldegrenze: auch danach werden alle Sicherungen versucht.
/// Ein Git-Fehler lässt die Dateien und gegebenenfalls den gefüllten Index stehen.
pub fn alles_anhalten(laeufe: Vec<&mut Lauf>, ordner: &[PathBuf], frist: Duration) -> Bericht {
    let start = Instant::now();
    let mut lauffehler = Vec::new();
    for lauf in laeufe {
        if let Err(fehler) = lauf.anhalten() {
            lauffehler.push((lauf.pid(), fehler.to_string()));
        }
    }
    let ordner = ordner
        .iter()
        .map(|ordner| Ordnerbericht {
            ordner: ordner.clone(),
            status: sichern(ordner).unwrap_or_else(|meldung| Ordnerstatus::Fehler { meldung }),
        })
        .collect();
    let dauer = start.elapsed();
    Bericht { ordner, lauffehler, dauer, frist_ueberschritten: dauer > frist }
}

fn sichern(ordner: &Path) -> Result<Ordnerstatus, String> {
    // Git sucht sonst in Elternordnern weiter und könnte die falsche Arbeitskopie sichern.
    if !git(ordner, &["rev-parse", "--show-prefix"])?.trim().is_empty() {
        return Err("Ordner ist nicht die Wurzel einer Arbeitskopie".into());
    }
    if git(ordner, &["status", "--porcelain", "--untracked-files=all"])?.is_empty() {
        return Ok(Ordnerstatus::Sauber);
    }
    git(ordner, &["add", "-A"])?;
    let zeit = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?;
    let nachricht = format!("WIP: angehalten {}", zeit.as_secs());
    git(ordner, &["commit", "--no-verify", "-m", &nachricht])?;
    let sha = git(ordner, &["rev-parse", "HEAD"])?.trim().to_owned();
    Ok(Ordnerstatus::Gesichert { sha })
}

fn git(ordner: &Path, argumente: &[&str]) -> Result<String, String> {
    let mut befehl = Command::new("git");
    befehl.arg("-C").arg(ordner).args(argumente).env("GIT_TERMINAL_PROMPT", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;
        befehl.creation_flags(CREATE_NO_WINDOW);
    }
    let ausgabe = befehl.output().map_err(|e| format!("git {}: {e}", argumente[0]))?;
    if !ausgabe.status.success() {
        return Err(format!(
            "git {} ({}): {}{}",
            argumente[0],
            ausgabe.status,
            String::from_utf8_lossy(&ausgabe.stderr),
            String::from_utf8_lossy(&ausgabe.stdout)
        ));
    }
    Ok(String::from_utf8_lossy(&ausgabe.stdout).into_owned())
}
