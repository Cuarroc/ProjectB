//! Startwünsche in CLI-Argumente und getrennten Prompt-Text übersetzen.

use crate::{Anbieter, Lauf};
use std::collections::HashMap;
use std::io::{Error, ErrorKind, Result};
use std::path::Path;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Effort {
    Niedrig,
    Mittel,
    Hoch,
}

#[derive(Debug, Clone)]
pub struct Startwunsch {
    pub rolle: Option<String>,
    pub modell: Option<String>,
    pub effort: Option<Effort>,
    pub fortsetzen: Option<String>,
    pub auftrag: String,
}

impl Startwunsch {
    /// Rolle bleibt normaler Text; der gesamte Prompt geht über stdin.
    pub fn prompt(&self) -> String {
        match &self.rolle {
            Some(rolle) => format!("{rolle}\n\n{}", self.auftrag),
            None => self.auftrag.clone(),
        }
    }
}

/// CLI-Hilfe geprüft: Claude --model/--effort; Codex --model/-c.
/// CLI-Hilfe geprüft: claude -p --output-format stream-json --verbose --resume <id> (Prompt über stdin);
/// codex exec resume <id> --json - (laut `claude --help` / `codex exec resume --help`).
/// Codex-Konfiguration: model_reasoning_effort (offizielle Config Reference).
pub fn argumente(anbieter: &Anbieter, wunsch: &Startwunsch) -> Result<Vec<String>> {
    if let Some(modell) = &wunsch.modell {
        if modell.is_empty()
            || modell.starts_with('-')
            || !modell.bytes().all(|c| c.is_ascii_alphanumeric() || b"._:-".contains(&c))
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "Modellname: nur A-Z, a-z, 0-9, ._:-; nicht leer oder mit - beginnen",
            ));
        }
    }
    if let Some(id) = &wunsch.fortsetzen {
        if id.is_empty() || id.starts_with('-') || !id.bytes().all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c))
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "Sitzungs-ID: nur A-Z, a-z, 0-9, -_; nicht leer oder mit - beginnen",
            ));
        }
    }
    if !matches!(anbieter.name, "claude" | "codex")
        && (wunsch.modell.is_some() || wunsch.effort.is_some() || wunsch.fortsetzen.is_some())
    {
        return Err(Error::new(
            ErrorKind::Unsupported,
            format!("Für Anbieter {} sind keine Modell-/Effort-/Fortsetzen-Schalter bekannt", anbieter.name),
        ));
    }
    let mut args: Vec<String> = anbieter.argumente.iter().map(|s| (*s).into()).collect();
    // Codex liest den Prompt am abschließenden '-' von stdin.
    let stdin_marker = anbieter.name == "codex" && args.last().is_some_and(|s| s == "-");
    if stdin_marker {
        args.pop();
    }
    if let Some(id) = &wunsch.fortsetzen {
        match anbieter.name {
            "claude" => args.extend(["--resume".into(), id.clone()]),
            "codex" => {
                args.splice(1..1, ["resume".into(), id.clone()]);
            }
            _ => unreachable!("unbekannte Schalter zuvor abgelehnt"),
        }
    }
    if let Some(modell) = &wunsch.modell {
        args.extend(["--model".into(), modell.clone()]);
    }
    if let Some(effort) = wunsch.effort {
        let wert = match effort {
            Effort::Niedrig => "low",
            Effort::Mittel => "medium",
            Effort::Hoch => "high",
        };
        match anbieter.name {
            "claude" => args.extend(["--effort".into(), wert.into()]),
            "codex" => args.extend(["-c".into(), format!("model_reasoning_effort=\"{wert}\"")]),
            _ => unreachable!("unbekannte Schalter zuvor abgelehnt"),
        }
    }
    if stdin_marker {
        args.push("-".into());
    }
    Ok(args)
}

type ArgumentCache = Mutex<HashMap<Vec<String>, &'static [&'static str]>>;

fn vorbereiten(anbieter: &Anbieter, wunsch: &Startwunsch) -> Result<Anbieter> {
    static CACHE: OnceLock<ArgumentCache> = OnceLock::new();
    let args = argumente(anbieter, wunsch)?;
    let mut cache = CACHE.get_or_init(Mutex::default).lock().map_err(|_| Error::other("Argument-Cache gesperrt"))?;
    // shortcut: Anbieter verlangt 'static. Jede eindeutige Argumentliste bleibt bis
    // zum Prozessende erhalten (Box::leak), gleiche Starts verwenden sie erneut.
    // Rolle/Auftrag werden nie gespeichert. Kein unsafe, keine Änderung an Lauf.
    let argumente = *cache.entry(args).or_insert_with_key(|args| {
        let teile: Vec<&'static str> = args.iter().map(|arg| &*Box::leak(arg.clone().into_boxed_str())).collect();
        Box::leak(teile.into_boxed_slice())
    });
    Ok(Anbieter { argumente, ..*anbieter })
}

/// Startet über den vorhandenen zentralen Prozesspfad einschließlich Job-Objekt.
pub fn starten(anbieter: &Anbieter, wunsch: &Startwunsch, ordner: &Path) -> Result<Lauf> {
    let anbieter = vorbereiten(anbieter, wunsch)?;
    Lauf::starten(&anbieter, &wunsch.prompt(), ordner)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CLAUDE, CODEX};

    #[test]
    fn adapter_uebernimmt_argumente_und_verwendet_cache_erneut() {
        let w = Startwunsch {
            rolle: None,
            modell: Some("modell-test".into()),
            effort: Some(Effort::Hoch),
            fortsetzen: None,
            auftrag: "Test".into(),
        };
        for a in [&CLAUDE, &CODEX] {
            let erster = vorbereiten(a, &w).unwrap();
            let zweiter = vorbereiten(a, &w).unwrap();
            assert_eq!(erster.argumente, argumente(a, &w).unwrap());
            assert!(std::ptr::eq(erster.argumente, zweiter.argumente));
            assert_eq!(erster.programm, a.programm);
            assert_eq!(erster.name, a.name);
        }
    }

    fn fortsetzung() -> Startwunsch {
        Startwunsch {
            rolle: None,
            modell: None,
            effort: None,
            fortsetzen: Some("AZaz09_-".into()),
            auftrag: "Weiter".into(),
        }
    }

    #[test]
    fn fortsetzen_beider_anbieter_mit_prompt_von_stdin() {
        let w = fortsetzung();
        assert_eq!(
            argumente(&CLAUDE, &w).unwrap(),
            ["-p", "--output-format", "stream-json", "--verbose", "--resume", "AZaz09_-"]
        );
        assert_eq!(argumente(&CODEX, &w).unwrap(), ["exec", "resume", "AZaz09_-", "--json", "-"]);
        assert_eq!(w.prompt(), "Weiter");
        let w = Startwunsch { modell: Some("modell".into()), effort: Some(Effort::Hoch), ..w };
        assert_eq!(
            argumente(&CODEX, &w).unwrap(),
            ["exec", "resume", "AZaz09_-", "--json", "--model", "modell", "-c", "model_reasoning_effort=\"high\"", "-"]
        );
        assert_eq!(
            argumente(&CLAUDE, &w).unwrap(),
            [
                "-p",
                "--output-format",
                "stream-json",
                "--verbose",
                "--resume",
                "AZaz09_-",
                "--model",
                "modell",
                "--effort",
                "high"
            ]
        );
    }

    #[test]
    fn ungueltige_sitzungs_ids_werden_abgelehnt() {
        for id in ["", "-id", "--help", "id x", "id;x", "sitzüng", "id\nx", "id/x", "id\"x", "id.x", "id:x"] {
            for a in [&CLAUDE, &CODEX] {
                let w = Startwunsch { fortsetzen: Some(id.into()), ..fortsetzung() };
                assert_eq!(argumente(a, &w).unwrap_err().kind(), ErrorKind::InvalidInput, "{id:?}");
            }
        }
        let unbekannt = Anbieter { name: "unbekannt", ..CLAUDE };
        assert_eq!(argumente(&unbekannt, &fortsetzung()).unwrap_err().kind(), ErrorKind::Unsupported);
    }
}
