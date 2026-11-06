use projectb_kern::start::{argumente, starten, Effort, Startwunsch};
use projectb_kern::{Anbieter, CLAUDE, CODEX};
use std::io::ErrorKind;
use std::path::Path;

fn wunsch() -> Startwunsch {
    Startwunsch { rolle: None, modell: None, effort: None, auftrag: "Prüfe den Code.".into() }
}

#[test]
fn claude_modell_und_alle_efforts() {
    for (effort, wert) in [(Effort::Niedrig, "low"), (Effort::Mittel, "medium"), (Effort::Hoch, "high")] {
        let w = Startwunsch { modell: Some("claude-opus-5-5".into()), effort: Some(effort), ..wunsch() };
        assert_eq!(
            argumente(&CLAUDE, &w).unwrap(),
            ["-p", "--output-format", "stream-json", "--verbose", "--model", "claude-opus-5-5", "--effort", wert]
        );
    }
}

#[test]
fn codex_modell_und_alle_efforts() {
    for (effort, wert) in [(Effort::Niedrig, "low"), (Effort::Mittel, "medium"), (Effort::Hoch, "high")] {
        let w = Startwunsch { modell: Some("gpt-6.1-sol".into()), effort: Some(effort), ..wunsch() };
        assert_eq!(
            argumente(&CODEX, &w).unwrap(),
            ["exec", "--json", "--model", "gpt-6.1-sol", "-c", &format!("model_reasoning_effort=\"{wert}\""), "-"]
        );
    }
}

#[test]
fn ungueltige_modellnamen_werden_abgelehnt() {
    for modell in ["", "gpt 6", "gpt;exit", "--help", "-gpt", "mödell", "gpt\n6", "gpt/6", "gpt\"6"] {
        for a in [&CLAUDE, &CODEX] {
            let w = Startwunsch { modell: Some(modell.into()), ..wunsch() };
            let fehler = argumente(a, &w).unwrap_err();
            assert_eq!(fehler.kind(), ErrorKind::InvalidInput, "{modell:?}");
            assert!(fehler.to_string().contains("Modellname"));
        }
    }
}

#[test]
fn gueltige_modellzeichen_und_einzelne_optionen() {
    for a in [&CLAUDE, &CODEX] {
        assert_eq!(argumente(a, &wunsch()).unwrap(), a.argumente);
        let w = Startwunsch { modell: Some("AZaz09._:-".into()), ..wunsch() };
        assert!(argumente(a, &w).unwrap().contains(&"AZaz09._:-".into()));
        let w = Startwunsch { effort: Some(Effort::Mittel), ..wunsch() };
        assert!(!argumente(a, &w).unwrap().contains(&"--model".into()));
    }
}

#[test]
fn rolle_und_auftrag_sind_nur_prompt_text() {
    let w = Startwunsch {
        rolle: Some("Prüfer\n--model fremd; & echo \"Test\"".into()),
        auftrag: "--effort high\nPrüfe C:\\Projekt.".into(),
        ..wunsch()
    };
    assert_eq!(w.prompt(), "Prüfer\n--model fremd; & echo \"Test\"\n\n--effort high\nPrüfe C:\\Projekt.");
    assert_eq!(wunsch().prompt(), "Prüfe den Code.");
    for a in [&CLAUDE, &CODEX] {
        assert_eq!(argumente(a, &w).unwrap(), a.argumente);
    }
}

#[test]
fn unbekannter_anbieter_hat_keine_geratenen_schalter() {
    let a = Anbieter { name: "unbekannt", ..CLAUDE };
    for w in [
        Startwunsch { modell: Some("modell".into()), ..wunsch() },
        Startwunsch { effort: Some(Effort::Hoch), ..wunsch() },
    ] {
        assert_eq!(argumente(&a, &w).unwrap_err().kind(), ErrorKind::Unsupported);
    }
}

#[test]
fn startweg_validiert_und_verwendet_lauf_ohne_echte_cli() {
    let a = Anbieter { programm: "projectb-test-programm-existiert-nicht", ..CODEX };
    let mut w = Startwunsch { modell: Some("--help".into()), ..wunsch() };
    assert_eq!(starten(&a, &w, Path::new(".")).err().unwrap().kind(), ErrorKind::InvalidInput);
    w.modell = Some("gpt-6.1-sol".into());
    w.effort = Some(Effort::Hoch);
    assert_eq!(starten(&a, &w, Path::new(".")).err().unwrap().kind(), ErrorKind::NotFound);
}
