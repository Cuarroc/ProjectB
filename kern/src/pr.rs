//! PR-Anlage mit getrennt prüfbaren Argumenten und Ausgabeparser.
use std::io;
use std::path::Path;
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Autor {
    Codex,
    Claude,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrInfo {
    pub url: String,
    pub nummer: u64,
}

fn pruefen(titel: &str, text: &str, branch: &str) -> io::Result<()> {
    if [titel, text, branch].iter().any(|wert| wert.starts_with('-') || wert.contains('\0'))
        || branch.contains(['\r', '\n'])
        || titel.trim().is_empty()
        || branch.trim().is_empty()
    {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Ungültiger Titel, Text oder Branch"));
    }
    Ok(())
}

/// Argumente für `gh`; ungültige Eingaben liefern keine Argumente.
/// `anlegen` meldet denselben Eingabefehler, ohne einen Prozess zu starten.
pub fn befehl(titel: &str, text: &str, autor: Autor, branch: &str) -> Vec<String> {
    if pruefen(titel, text, branch).is_err() {
        return Vec::new();
    }
    let (name, label) = match autor {
        Autor::Codex => ("Codex", "autor-codex"),
        Autor::Claude => ("Claude", "autor-claude"),
    };
    let inhalt =
        text.lines().filter(|zeile| !zeile.trim().starts_with("Geschrieben von:")).collect::<Vec<_>>().join("\n");
    let inhalt = inhalt.trim_end();
    let mut body = if inhalt.is_empty() {
        format!("Geschrieben von: {name}")
    } else {
        format!("{inhalt}\n\nGeschrieben von: {name}")
    };
    // Nach dem Entfernen einer Autorzeile kann erstmals ein '-' vorne stehen.
    if body.starts_with('-') {
        body.insert(0, '\n');
    }
    ["pr", "create", "--base", "main", "--head", branch, "--title", titel, "--body", &body, "--label", label]
        .into_iter()
        .map(str::to_owned)
        .collect()
}

/// Liest eine vollständige github.com-PR-URL aus einer Ausgabezeile.
/// Prozessfehler haben Vorrang; stderr und Exit-Code bleiben im Fehler erhalten.
pub fn lies_ausgabe(erfolg: bool, code: Option<i32>, stdout: &str, stderr: &str) -> io::Result<PrInfo> {
    if erfolg {
        for url in stdout.lines().map(str::trim) {
            let Some(pfad) = url.strip_prefix("https://github.com/") else { continue };
            let teile: Vec<_> = pfad.split('/').collect();
            if teile.len() != 4 || teile[2] != "pull" {
                continue;
            }
            let name_gueltig = |name: &str| {
                !name.is_empty()
                    && name != "."
                    && name != ".."
                    && name.bytes().all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
            };
            if !name_gueltig(teile[0]) || !name_gueltig(teile[1]) || !teile[3].bytes().all(|b| b.is_ascii_digit()) {
                continue;
            }
            if let Ok(nummer) = teile[3].parse::<u64>() {
                if nummer > 0 {
                    return Ok(PrInfo { url: url.into(), nummer });
                }
            }
        }
    }
    let code = code.map_or_else(|| "unbekannt".into(), |n| n.to_string());
    let grund = if erfolg { "Keine PR-URL in der Ausgabe" } else { "gh pr create fehlgeschlagen" };
    Err(io::Error::other(format!("{grund} (Exit-Code: {code}); stderr: {stderr}")))
}

/// Startet ausschließlich `gh` mit einzelnen Argumenten in der Arbeitskopie.
pub fn anlegen(ordner: &Path, titel: &str, text: &str, autor: Autor, branch: &str) -> io::Result<PrInfo> {
    pruefen(titel, text, branch)?;
    let mut kommando = Command::new(if cfg!(windows) { "gh.exe" } else { "gh" });
    kommando.args(befehl(titel, text, autor, branch)).current_dir(ordner).stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;
        kommando.creation_flags(CREATE_NO_WINDOW);
    }
    let ausgabe = kommando.output()?;
    lies_ausgabe(
        ausgabe.status.success(),
        ausgabe.status.code(),
        &String::from_utf8_lossy(&ausgabe.stdout),
        &String::from_utf8_lossy(&ausgabe.stderr),
    )
}
