use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Debug)]
pub struct Ergebnis {
    /// Kein Code bei Start-/Lesefehlern oder Beendigung durch ein Signal.
    pub exit_code: Option<i32>,
    pub laufzeit: Duration,
    /// Ausschließlich der erfolgreiche Prozessstatus entscheidet.
    pub erfolgreich: bool,
    /// Anzahl bestandener Tests; unbekannte Formate liefern keine Zahl.
    pub gruen: Option<usize>,
    /// Bestandene, fehlgeschlagene und übersprungene Tests; ausgefilterte zählen nicht.
    pub gesamt: Option<usize>,
    pub fehler: Option<String>,
}

/// Führt Programm und Argumente im angegebenen Arbeitsordner aus, ohne eigene Shell.
pub fn ausfuehren(ordner: &Path, befehl: &[&str]) -> Ergebnis {
    let start = Instant::now();
    let lauf = || -> std::io::Result<_> {
        let (programm, argumente) = befehl
            .split_first()
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Testbefehl ist leer"))?;
        let mut kommando = Command::new(crate::finde_programm(programm));
        kommando.args(argumente).current_dir(ordner);
        kommando.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(windows)]
        let (tx, rx) = std::sync::mpsc::channel();
        #[cfg(windows)]
        let (kind, _job) = crate::job::starten(&mut kommando, tx)?;
        #[cfg(not(windows))]
        let kind = kommando.spawn()?;
        let ausgabe = kind.wait_with_output()?;
        #[cfg(windows)]
        let fehler = {
            let meldungen: Vec<_> = rx
                .into_iter()
                .filter_map(|e| match e {
                    crate::Ereignis::Meldung(text) => Some(text),
                    _ => None,
                })
                .collect();
            (!meldungen.is_empty()).then(|| meldungen.join("; "))
        };
        #[cfg(not(windows))]
        let fehler = None;
        Ok((ausgabe, fehler))
    };
    match lauf() {
        Ok((ausgabe, fehler)) => {
            let text =
                format!("{}\n{}", String::from_utf8_lossy(&ausgabe.stdout), String::from_utf8_lossy(&ausgabe.stderr));
            let anzahl = zaehlen(&text);
            Ergebnis {
                exit_code: ausgabe.status.code(),
                laufzeit: start.elapsed(),
                erfolgreich: ausgabe.status.success(),
                gruen: anzahl.map(|(gruen, _)| gruen),
                gesamt: anzahl.map(|(_, gesamt)| gesamt),
                fehler,
            }
        }
        Err(e) => Ergebnis {
            exit_code: None,
            laufzeit: start.elapsed(),
            erfolgreich: false,
            gruen: None,
            gesamt: None,
            fehler: Some(e.to_string()),
        },
    }
}

fn zaehlen(ausgabe: &str) -> Option<(usize, usize)> {
    // Cargo und Vitest färben ihre Zusammenfassungen mit ANSI-CSI-Sequenzen.
    let mut ansi = false;
    let text: String = ausgabe
        .chars()
        .filter(|&c| {
            if c == '\x1b' {
                ansi = true;
                return false;
            }
            if ansi {
                if c != '[' && ('@'..='~').contains(&c) {
                    ansi = false;
                }
                return false;
            }
            true
        })
        .collect();
    let mut gesamt: Option<usize> = None;
    let mut bestanden = 0usize;
    for zeile in text.lines().map(str::trim) {
        let mut gruen = 0usize;
        let anzahl = if let Some(rest) = zeile.strip_prefix("test result: ") {
            let rest = rest.strip_prefix("ok. ").or_else(|| rest.strip_prefix("FAILED. "))?;
            let mut teile = rest.split(';');
            let mut summe = 0usize;
            for status in ["passed", "failed", "ignored"] {
                let zahl = teile.next()?.trim().strip_suffix(status)?.trim().parse::<usize>().ok()?;
                summe = summe.checked_add(zahl)?;
                if status == "passed" {
                    gruen = zahl;
                }
            }
            summe
        } else if let Some(rest) = zeile.strip_prefix("Tests ") {
            let (teile, total) = rest.rsplit_once('(')?;
            let total = total.strip_suffix(')')?.parse::<usize>().ok()?;
            let mut summe = 0usize;
            for teil in teile.split('|') {
                let mut worte = teil.split_whitespace();
                let zahl = worte.next()?.parse::<usize>().ok()?;
                let status = worte.next()?;
                if !matches!(status, "passed" | "failed" | "skipped" | "todo") || worte.next().is_some() {
                    return None;
                }
                summe = summe.checked_add(zahl)?;
                if status == "passed" {
                    gruen = gruen.checked_add(zahl)?;
                }
            }
            if summe != total {
                return None;
            }
            total
        } else {
            continue;
        };
        gesamt = Some(gesamt.unwrap_or(0).checked_add(anzahl)?);
        bestanden = bestanden.checked_add(gruen)?;
    }
    gesamt.map(|gesamt| (bestanden, gesamt))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Zusammenfassungen des lokalen grünen Gesamtlaufs und des ersten roten Testlaufs.
    const CARGO_GRUEN: &str = "running 8 tests\n\
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.55s\n\
running 14 tests\n\
test result: ok. 14 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 4.05s\n\
running 8 tests\n\
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.15s\n\
   Doc-tests projectb_kern\n\
running 0 tests\n\
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\n";
    const CARGO_ROT: &str = "running 6 tests\n\
test pruefung::tests::cargo_mehrere_bloecke_und_roter_lauf ... FAILED\n\
test result: FAILED. 1 passed; 5 failed; 0 ignored; 0 measured; 2 filtered out; finished in 0.00s\n\
error: test failed, to rerun pass `--lib`\n";

    #[test]
    fn cargo_mehrere_bloecke_und_roter_lauf() {
        assert_eq!(zaehlen(CARGO_GRUEN), Some((30, 30)));
        assert_eq!(zaehlen(CARGO_ROT), Some((1, 6)));
        assert_eq!(
            zaehlen("test result: ok. 1 passed; 0 failed; 1 ignored; 0 measured; 3 filtered out; finished in 0.01s"),
            Some((1, 2))
        );
    }

    #[test]
    fn vitest_gruen_rot_und_farben() {
        // Vitest-Zusammenfassungen aus den Abnahmen und dem roten Lauf von PR #74.
        assert_eq!(zaehlen(" Test Files  1 passed (1)\n      Tests  8 passed (8)"), Some((8, 8)));
        assert_eq!(zaehlen("      Tests  4 failed | 4 passed (8)"), Some((4, 8)));
        assert_eq!(zaehlen(" ❯ src/probe.test.ts (4 tests | 1 failed | 1 skipped)\n Test Files  1 failed (1)\n      Tests  1 failed | 2 passed | 1 skipped (4)\n"), Some((2, 4)));
        assert_eq!(zaehlen("\x1b[32m      Tests  \x1b[39m2 passed\x1b[2m (2)\x1b[22m"), Some((2, 2)));
    }

    #[test]
    fn unbekannt_und_ungueltig_bleibt_unbekannt() {
        for ausgabe in [
            "Alles gut: 12 Tests",
            "Tests  fertig",
            "Tests  3 passed (9)",
            "",
            "Tests  999999999999999999999999999 passed (999999999999999999999999999)",
        ] {
            assert_eq!(zaehlen(ausgabe), None, "{ausgabe}");
        }
    }

    fn shell(ordner: &Path, windows: &str, unix: &str) -> Ergebnis {
        if cfg!(windows) {
            ausfuehren(ordner, &["cmd.exe", "/D", "/C", windows])
        } else {
            ausfuehren(ordner, &["sh", "-c", unix])
        }
    }

    #[test]
    fn exit_eins_trotz_null_failed_bleibt_rot() {
        let ergebnis = shell(
            Path::new(env!("CARGO_MANIFEST_DIR")),
            "echo test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s & exit /b 1",
            "printf 'test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\n'; exit 1",
        );
        assert_eq!(ergebnis.exit_code, Some(1));
        assert!(!ergebnis.erfolgreich);
        assert_eq!(ergebnis.gruen, Some(4));
        assert_eq!(ergebnis.gesamt, Some(4));
        assert!(ergebnis.fehler.is_none());
        assert!(ergebnis.laufzeit > Duration::ZERO);
    }

    #[test]
    fn arbeitsordner_und_beide_ausgabekanaele() {
        let ergebnis = shell(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("src").as_path(),
            "echo Tests  2 passed (2) & echo Tests  1 passed (1) 1>&2 & if exist lib.rs (exit /b 0) else (exit /b 9)",
            "test -f lib.rs || exit 9; printf 'Tests  2 passed (2)\n'; printf 'Tests  1 passed (1)\n' >&2; exit 0",
        );
        assert_eq!(ergebnis.exit_code, Some(0));
        assert!(ergebnis.erfolgreich);
        assert_eq!(ergebnis.gruen, Some(3));
        assert_eq!(ergebnis.gesamt, Some(3));
    }

    #[test]
    fn exit_null_ohne_bekanntes_format_bleibt_ohne_anzahl() {
        let ergebnis =
            shell(Path::new(env!("CARGO_MANIFEST_DIR")), "echo Alles gut & exit /b 0", "echo Alles gut; exit 0");
        assert_eq!(ergebnis.exit_code, Some(0));
        assert!(ergebnis.erfolgreich);
        assert_eq!(ergebnis.gruen, None);
        assert_eq!(ergebnis.gesamt, None);
    }

    #[test]
    fn startfehler_hat_keinen_erfundenen_exit_code() {
        for befehl in [vec![], vec!["projectb-nicht-vorhandenes-testprogramm"]] {
            let ergebnis = ausfuehren(Path::new(env!("CARGO_MANIFEST_DIR")), &befehl);
            assert!(!ergebnis.erfolgreich);
            assert_eq!(ergebnis.gruen, None);
            assert_eq!(ergebnis.exit_code, None);
            assert_eq!(ergebnis.gesamt, None);
            assert!(ergebnis.fehler.is_some());
        }
    }
}
