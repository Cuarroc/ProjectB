pub use std::io::Error as Fehler;
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::Path,
    process::{Command, Output},
    sync::atomic::{AtomicUsize, Ordering},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Projekt {
    pub projekt: String,
    pub pfad: String,
    pub zweig: String,
}

/// Prüft das Projekt und merkt ausschließlich seine ermittelte Repo-Wurzel.
pub fn oeffnen(pfad: impl AsRef<Path>, datei: impl AsRef<Path>) -> Result<Projekt, Fehler> {
    let projekt = pruefen(pfad)?;
    zuletzt_merken(datei, &projekt.pfad)?;
    Ok(projekt)
}

/// Ermittelt die Arbeitsbaumwurzel, auch aus Unterordnern und bei leerem Repo.
pub fn pruefen(pfad: impl AsRef<Path>) -> Result<Projekt, Fehler> {
    let pfad = pfad.as_ref();
    if !pfad.is_dir() {
        return Err(Fehler::new(io::ErrorKind::NotFound, "Ordner fehlt oder ist kein Ordner"));
    }
    let wurzel = git(pfad, &["rev-parse", "--show-toplevel"])?;
    if !wurzel.status.success() {
        return Err(Fehler::other(format!("Ordner ist kein Git-Repo: {}", git_fehler(&wurzel))));
    }
    let wurzel = text(wurzel)?;
    let projekt = Path::new(&wurzel)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| Fehler::other("Repo-Wurzel hat keinen lesbaren Ordnernamen"))?
        .to_owned();
    let branch = git(pfad, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let zweig = if branch.status.code() == Some(1) {
        text(git(pfad, &["rev-parse", "--short", "HEAD"])?)?
    } else {
        text(branch)?
    };
    Ok(Projekt { projekt, pfad: wurzel, zweig })
}

fn git(pfad: &Path, args: &[&str]) -> io::Result<Output> {
    let mut befehl = Command::new("git");
    #[cfg(windows)]
    let normalisiert = pfad
        .to_str()
        .and_then(|s| s.strip_prefix(r"\\?\"))
        .map(|s| s.strip_prefix(r"UNC\").map_or_else(|| s.to_owned(), |unc| format!(r"\\{unc}")));
    #[cfg(windows)]
    let pfad = normalisiert.as_deref().map(Path::new).unwrap_or(pfad);
    befehl.arg("-C").arg(pfad).args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        befehl.creation_flags(0x08000000); // CREATE_NO_WINDOW, wie in arbeitskopie.rs
    }
    befehl.output().map_err(|e| {
        Fehler::new(
            e.kind(),
            if e.kind() == io::ErrorKind::NotFound {
                "Git nicht gefunden. Bitte Git installieren.".into()
            } else {
                format!("Git konnte nicht gestartet werden: {e}")
            },
        )
    })
}

fn git_fehler(ausgabe: &Output) -> String {
    format!("{}: {}", ausgabe.status, String::from_utf8_lossy(&ausgabe.stderr).trim())
}

fn text(ausgabe: Output) -> io::Result<String> {
    if !ausgabe.status.success() {
        return Err(Fehler::other(format!("Git fehlgeschlagen: {}", git_fehler(&ausgabe))));
    }
    String::from_utf8(ausgabe.stdout)
        .map(|s| {
            let zeile = s.strip_suffix('\n').unwrap_or(&s);
            #[cfg(windows)]
            let zeile = zeile.strip_suffix('\r').unwrap_or(zeile);
            zeile.to_owned()
        })
        .map_err(|_| Fehler::new(io::ErrorKind::InvalidData, "Git-Ausgabe ist kein gültiges UTF-8"))
}

/// Fehlende, unlesbare oder kaputte Dateien ergeben eine leere Liste.
pub fn zuletzt_laden(datei: impl AsRef<Path>) -> Vec<String> {
    fs::read(datei).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn schluessel(pfad: &str) -> String {
    if cfg!(windows) || pfad.as_bytes().get(1) == Some(&b':') || pfad.starts_with(r"\\") || pfad.starts_with("//") {
        pfad.replace('\\', "/").to_lowercase()
    } else {
        pfad.to_owned()
    }
}

/// Neuester Pfad zuerst; Windows-Pfade werden unabhängig von der Schreibweise verglichen.
/// Ersetzt die Datei atomar wie einstellungen::speichern; der Elternordner muss existieren.
pub fn zuletzt_merken(datei: impl AsRef<Path>, pfad: &str) -> io::Result<()> {
    let ziel = datei.as_ref();
    let mut liste = zuletzt_laden(ziel);
    liste.insert(0, pfad.to_owned());
    let mut bekannt = HashSet::new();
    liste.retain(|p| bekannt.insert(schluessel(p)));
    liste.truncate(10);
    let daten = serde_json::to_vec_pretty(&liste)?;
    let name = ziel.file_name().ok_or_else(|| Fehler::other("Dateiname fehlt"))?;
    static NR: AtomicUsize = AtomicUsize::new(0);
    let (temp, mut datei) = loop {
        let mut temp_name = name.to_os_string();
        temp_name.push(format!(".{}-{}.tmp", std::process::id(), NR.fetch_add(1, Ordering::Relaxed)));
        let temp = ziel.with_file_name(temp_name);
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
        fs::rename(&temp, ziel)
    })();
    if ergebnis.is_err() {
        let _ = fs::remove_file(&temp);
    }
    ergebnis
}
