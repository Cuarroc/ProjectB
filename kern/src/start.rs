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
    SehrHoch,
}

impl Effort {
    pub fn aus_text(text: &str) -> Option<Self> {
        match text {
            "Niedrig" => Some(Self::Niedrig),
            "Mittel" => Some(Self::Mittel),
            "Hoch" => Some(Self::Hoch),
            "Sehr hoch" => Some(Self::SehrHoch),
            _ => None,
        }
    }
}

// CLI-Hilfe geprüft (claude --help): Aliase oder volle Modellnamen. Die 5.5-IDs sind die offiziellen
// Anthropic-Modell-IDs (claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5).
// Codex: gpt-6.1-sol laut https://learn.chatgpt.com/docs/config-file/config-reference.
pub fn modell(anzeige: &str) -> Option<(&'static str, &'static str)> {
    match anzeige {
        "Opus 5.5" => Some(("claude", "claude-opus-5-5")),
        "Sonnet 5.5" => Some(("claude", "claude-sonnet-5-5")),
        "Haiku 5.5" => Some(("claude", "claude-haiku-5-5")),
        "gpt-6.1-sol" => Some(("codex", "gpt-6.1-sol")),
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Berechtigung {
    Vorsichtig,
    #[default]
    NurBeiWichtigem,
    Autonom,
}

impl Berechtigung {
    // Wie die übrigen Kern-Einstellungen: JSON-Text ohne zusätzliche Serde-Abhängigkeit.
    pub fn text(self) -> &'static str {
        match self {
            Self::Vorsichtig => "Vorsichtig",
            Self::NurBeiWichtigem => "Nur bei Wichtigem",
            Self::Autonom => "Autonom",
        }
    }

    pub fn aus_text(text: &str) -> Option<Self> {
        [Self::Vorsichtig, Self::NurBeiWichtigem, Self::Autonom].into_iter().find(|stufe| stufe.text() == text)
    }
}

#[derive(Debug, Clone)]
pub struct Startwunsch {
    pub rolle: Option<String>,
    pub modell: Option<String>,
    pub effort: Option<Effort>,
    pub fortsetzen: Option<String>,
    pub nur_lesen: bool,
    pub berechtigung: Option<Berechtigung>,
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
        && (wunsch.modell.is_some() || wunsch.effort.is_some() || wunsch.fortsetzen.is_some() || wunsch.nur_lesen)
    {
        return Err(Error::new(
            ErrorKind::Unsupported,
            format!("Für Anbieter {} sind keine Modell-/Effort-/Fortsetzen-/Nur-Lesen-Schalter bekannt", anbieter.name),
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
        // CLI-Hilfe geprüft: claude --help: low, medium, high, xhigh, max.
        // Codex exec --help: -c; Config Reference (Link oben): u. a. low, medium, high, xhigh.
        let wert = match effort {
            Effort::Niedrig => "low",
            Effort::Mittel => "medium",
            Effort::Hoch => "high",
            Effort::SehrHoch => "xhigh",
        };
        match anbieter.name {
            "claude" => args.extend(["--effort".into(), wert.into()]),
            "codex" => args.extend(["-c".into(), format!("model_reasoning_effort=\"{wert}\"")]),
            _ => unreachable!("unbekannte Schalter zuvor abgelehnt"),
        }
    }
    if let Some(berechtigung) = wunsch.berechtigung {
        // Geprüft: Claude Code 2.1.314 --help: --permission-mode, --allowedTools, --disallowedTools.
        // Muster und Grenzen: https://code.claude.com/docs/en/permissions (keine Shell-Sandbox).
        if anbieter.name == "claude" {
            let modus = if wunsch.nur_lesen { "plan" } else { "acceptEdits" };
            args.extend(["--permission-mode".into(), modus.into()]);
            let mut sperren = concat!(
                "Bash(git push *),Bash(git tag *),Bash(git remote *),Bash(git config *),Bash(gh *),",
                // permissions#Wildcard-patterns: mittiges * erlaubt; mehrere * brauchen auch die Form ohne Schlussargument.
                "Bash(git * push),Bash(git * push *),Bash(git * tag),Bash(git * tag *),",
                "Bash(git * remote),Bash(git * remote *),Bash(git * config),Bash(git * config *),",
                "Bash(npm publish *),Bash(npm install -g *),Bash(cargo install *),Bash(rm *),",
                "Edit(.github/**),Edit(.mergify.yml),Edit(.mcp.json),Edit(.claude/**),Edit(.agents/**)"
            )
            .to_owned();
            // permissions#powershell: dieselben Befehlsmuster wie bei Bash.
            let powershell: Vec<_> =
                sperren.split(',').filter_map(|r| r.strip_prefix("Bash")).map(|r| format!("PowerShell{r}")).collect();
            sperren.push(',');
            sperren.push_str(&powershell.join(","));
            if wunsch.nur_lesen {
                args.extend(["--settings".into(), r#"{"useAutoModeDuringPlan":false}"#.into()]);
                sperren.push_str(",ExitPlanMode");
            } else if berechtigung == Berechtigung::Autonom {
                args.push("--allowedTools=Bash".into());
            } else {
                let mut erlaubt = "Bash(git status *),Bash(git diff *),Bash(git log *),Bash(cargo test *),Bash(npm test *),Bash(npm run test *)".to_owned();
                if berechtigung == Berechtigung::NurBeiWichtigem {
                    erlaubt.push_str(",Bash(cargo build *),Bash(npm run build *),Bash(git add *),Bash(git commit *)");
                }
                args.push(format!("--allowedTools={erlaubt}"));
            }
            args.push(format!("--disallowedTools={sperren}"));
        } else if anbieter.name == "codex" {
            // Geprüft: codex-cli 0.166.0, exec/resume --help: -c <key=value>, verschachtelte TOML-Werte.
            // Schlüssel: https://learn.chatgpt.com/docs/config-file/config-reference
            let sandbox = if wunsch.nur_lesen { "read-only" } else { "workspace-write" };
            let netz = !wunsch.nur_lesen && berechtigung == Berechtigung::Autonom;
            args.extend([
                "-c".into(),
                format!("sandbox_mode=\"{sandbox}\""),
                "-c".into(),
                "approval_policy=\"never\"".into(),
                "-c".into(),
                format!("sandbox_workspace_write.network_access={netz}"),
            ]);
        }
    } else if wunsch.nur_lesen {
        match anbieter.name {
            "claude" => args.extend([
                "--permission-mode".into(),
                "plan".into(),
                "--settings".into(),
                r#"{"useAutoModeDuringPlan":false}"#.into(),
                "--disallowedTools=ExitPlanMode".into(),
            ]),
            "codex" => args.extend(["-c".into(), "sandbox_mode=\"read-only\"".into()]),
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

pub fn agenten_umgebung(gh_ordner: &Path) -> Vec<(String, Option<std::ffi::OsString>)> {
    // git help config: ENVIRONMENT (COUNT/KEY_n/VALUE_n), url.<base>.pushInsteadOf (nur Push).
    // https://git-scm.com/docs/git-config: explizites pushurl umgeht die Umschreibung, git -c hat Vorrang.
    let mut env = vec![("GIT_CONFIG_COUNT".into(), Some("4".into()))];
    for (i, protokoll) in ["https://", "http://", "ssh://", "git@"].into_iter().enumerate() {
        env.push((format!("GIT_CONFIG_KEY_{i}"), Some("url.projectb-no-push://.pushInsteadOf".into())));
        env.push((format!("GIT_CONFIG_VALUE_{i}"), Some(protokoll.into())));
    }
    // https://cli.github.com/manual/gh_help_environment: Token-Vorrang und Konfigurationsordner.
    env.extend([
        ("GH_TOKEN".into(), None),
        ("GITHUB_TOKEN".into(), None),
        ("GH_CONFIG_DIR".into(), Some(gh_ordner.as_os_str().into())),
    ]);
    env
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CLAUDE, CODEX};

    const STUFEN: [Berechtigung; 3] = [Berechtigung::Vorsichtig, Berechtigung::NurBeiWichtigem, Berechtigung::Autonom];

    #[test]
    fn agenten_umgebung_sperrt_push_und_entfernt_gh_anmeldung() {
        let env: HashMap<_, _> = agenten_umgebung(Path::new("leeres-gh")).into_iter().collect();
        assert_eq!(env["GIT_CONFIG_COUNT"], Some("4".into()));
        for (i, protokoll) in ["https://", "http://", "ssh://", "git@"].into_iter().enumerate() {
            assert_eq!(env[&format!("GIT_CONFIG_KEY_{i}")], Some("url.projectb-no-push://.pushInsteadOf".into()));
            assert_eq!(env[&format!("GIT_CONFIG_VALUE_{i}")], Some(protokoll.into()));
        }
        assert_eq!(env["GH_TOKEN"], None);
        assert_eq!(env["GITHUB_TOKEN"], None);
        assert_eq!(env["GH_CONFIG_DIR"], Some("leeres-gh".into()));
    }

    #[test]
    fn berechtigung_verwendet_die_json_namen_der_oberflaeche() {
        for (stufe, text) in STUFEN.into_iter().zip(["Vorsichtig", "Nur bei Wichtigem", "Autonom"]) {
            assert_eq!(stufe.text(), text);
            assert_eq!(Berechtigung::aus_text(text), Some(stufe));
        }
        for text in ["", "NurBeiWichtigem", "vorsichtig", "Autonom "] {
            assert_eq!(Berechtigung::aus_text(text), None);
        }
    }

    #[test]
    fn berechtigungsstufen_werden_fuer_beide_anbieter_uebersetzt() {
        assert_eq!(Berechtigung::default(), Berechtigung::NurBeiWichtigem);
        for stufe in STUFEN {
            let w = Startwunsch { berechtigung: Some(stufe), fortsetzen: None, ..fortsetzung() };
            let claude = argumente(&CLAUDE, &w).unwrap();
            assert!(claude.windows(2).any(|p| p == ["--permission-mode", "acceptEdits"]), "{claude:?}");
            assert!(!claude.iter().any(|a| a.contains("bypassPermissions")));
            let erlaubt = claude.iter().find_map(|a| a.strip_prefix("--allowedTools=")).unwrap_or("");
            for befehl in ["git status", "git diff", "git log", "cargo test", "npm test", "npm run test"] {
                assert_eq!(erlaubt.contains(&format!("Bash({befehl} *)")), stufe != Berechtigung::Autonom);
            }
            for befehl in ["cargo build", "npm run build", "git add", "git commit"] {
                assert_eq!(erlaubt.contains(&format!("Bash({befehl} *)")), stufe == Berechtigung::NurBeiWichtigem);
            }
            if stufe == Berechtigung::Autonom {
                assert_eq!(erlaubt, "Bash");
            }
            let codex = argumente(&CODEX, &w).unwrap();
            let netz = format!("sandbox_workspace_write.network_access={}", stufe == Berechtigung::Autonom);
            let sandbox = "sandbox_mode=\"workspace-write\"";
            let freigabe = "approval_policy=\"never\"";
            assert_eq!(codex, ["exec", "--json", "-c", sandbox, "-c", freigabe, "-c", &netz, "-"]);
            assert_eq!(
                erlaubt.split(',').filter(|r| !r.is_empty()).count(),
                match stufe {
                    Berechtigung::Vorsichtig => 6,
                    Berechtigung::NurBeiWichtigem => 10,
                    Berechtigung::Autonom => 1,
                }
            );
            assert!(!claude.iter().chain(&codex).any(|a| a.contains("danger-full-access")));
        }
    }

    #[test]
    fn nur_lesen_ignoriert_jede_stufe_auch_beim_fortsetzen() {
        for anbieter in [&CLAUDE, &CODEX] {
            for fortsetzen in [None, Some("sitzung".into())] {
                let w = Startwunsch {
                    berechtigung: Some(Berechtigung::Vorsichtig),
                    nur_lesen: true,
                    fortsetzen,
                    ..fortsetzung()
                };
                let erwartet = argumente(anbieter, &w).unwrap();
                for berechtigung in STUFEN {
                    assert_eq!(
                        argumente(anbieter, &Startwunsch { berechtigung: Some(berechtigung), ..w.clone() }).unwrap(),
                        erwartet
                    );
                }
                if anbieter.name == "claude" {
                    assert!(erwartet.windows(2).any(|p| p == ["--permission-mode", "plan"]));
                    assert!(erwartet.iter().any(|a| a.contains("ExitPlanMode")));
                    assert!(!erwartet.iter().any(|a| a.starts_with("--allowedTools")));
                } else {
                    assert!(erwartet.contains(&"sandbox_mode=\"read-only\"".into()));
                    assert!(erwartet.contains(&"sandbox_workspace_write.network_access=false".into()));
                    assert!(erwartet.contains(&"approval_policy=\"never\"".into()));
                }
                assert!(!erwartet.iter().any(|a| a.contains("danger-full-access")));
            }
        }
    }

    #[test]
    fn claude_sperrliste_gilt_in_jeder_stufe_auch_nur_lesend() {
        for berechtigung in STUFEN {
            for nur_lesen in [false, true] {
                let w = Startwunsch { berechtigung: Some(berechtigung), nur_lesen, ..fortsetzung() };
                let args = argumente(&CLAUDE, &w).unwrap();
                let sperren = args.iter().find_map(|a| a.strip_prefix("--disallowedTools=")).unwrap_or("");
                let mut regeln = vec!["Bash(gh *)".to_owned(), "Bash(rm *)".to_owned()];
                for befehl in ["push", "tag", "remote", "config"] {
                    regeln.extend([
                        format!("Bash(git {befehl} *)"),
                        format!("Bash(git * {befehl})"),
                        format!("Bash(git * {befehl} *)"),
                    ]);
                }
                for befehl in ["npm publish", "npm install -g", "cargo install"] {
                    regeln.push(format!("Bash({befehl} *)"));
                }
                for pfad in [".github/**", ".mergify.yml", ".mcp.json", ".claude/**", ".agents/**"] {
                    regeln.push(format!("Edit({pfad})"));
                }
                for regel in regeln {
                    assert!(sperren.split(',').any(|r| r == regel), "{regel}: {sperren}");
                    if let Some(muster) = regel.strip_prefix("Bash") {
                        assert!(sperren.split(',').any(|r| r == format!("PowerShell{muster}")), "{regel}");
                    }
                }
            }
        }
    }

    #[test]
    fn adapter_uebernimmt_argumente_und_verwendet_cache_erneut() {
        let w = Startwunsch {
            rolle: None,
            modell: Some("modell-test".into()),
            effort: Some(Effort::Hoch),
            fortsetzen: None,
            berechtigung: None,
            nur_lesen: false,
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
            berechtigung: None,
            nur_lesen: false,
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
