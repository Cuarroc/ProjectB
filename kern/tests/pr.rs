use projectb_kern::pr::{anlegen, befehl, lies_ausgabe, Autor, PrInfo};
use std::path::Path;

#[test]
fn argumente_und_label_je_autor() {
    for (autor, name, label) in [(Autor::Codex, "Codex", "autor-codex"), (Autor::Claude, "Claude", "autor-claude")] {
        let titel = "Titel mit \"Zitat\" & $(Befehl)";
        let text = "Text\nZweite Zeile; --help";
        assert_eq!(
            befehl(titel, text, autor, "paket/test"),
            [
                "pr",
                "create",
                "--base",
                "main",
                "--head",
                "paket/test",
                "--title",
                titel,
                "--body",
                &format!("{text}\n\nGeschrieben von: {name}"),
                "--label",
                label,
            ]
        );
    }
}

#[test]
fn autorzeile_genau_einmal_am_ende() {
    for (autor, name) in [(Autor::Codex, "Codex"), (Autor::Claude, "Claude")] {
        for text in [
            "Text",
            "Text\nGeschrieben von: Codex",
            "Geschrieben von: Claude\r\nText\r\nGeschrieben von: Codex\r\n",
            "Text\n  Geschrieben von: Claude  \nGeschrieben von: Codex\n",
            "",
        ] {
            let argumente = befehl("Titel", text, autor, "paket/test");
            let body = &argumente[9];
            assert_eq!(body.lines().filter(|z| z.starts_with("Geschrieben von:")).count(), 1);
            assert_eq!(body.lines().last(), Some(format!("Geschrieben von: {name}").as_str()));
        }
    }
}

#[test]
fn entfernte_autorzeile_macht_den_body_nicht_zum_schalter() {
    let argumente = befehl("Titel", "Geschrieben von: Codex\n--help", Autor::Codex, "paket");
    assert!(!argumente[9].starts_with('-'));
    assert!(argumente[9].contains("--help"));
}

#[test]
fn unsichere_argumente_werden_vor_prozessstart_abgelehnt() {
    for (titel, text, branch) in [
        ("Titel", "Text", "--help"),
        ("Titel", "Text", "paket\nneuer-branch"),
        ("Titel", "Text", "paket\rbranch"),
        ("--help", "Text", "paket"),
        ("Titel", "--help", "paket"),
        ("Titel\0", "Text", "paket"),
    ] {
        assert!(befehl(titel, text, Autor::Codex, branch).is_empty());
        let fehler = anlegen(Path::new("existiert-nicht"), titel, text, Autor::Codex, branch).unwrap_err();
        assert_eq!(fehler.kind(), std::io::ErrorKind::InvalidInput);
    }
}

#[test]
fn ausgabe_liefert_url_und_nummer() {
    let url = "https://github.com/Cuarroc/ProjectB/pull/123";
    assert_eq!(
        lies_ausgabe(true, Some(0), &format!("Hinweis\r\n{url}\r\n"), "Warnung").unwrap(),
        PrInfo { url: url.into(), nummer: 123 }
    );
}

#[test]
fn leere_und_fremde_ausgaben_sind_fehler_mit_stderr() {
    for stdout in [
        "",
        "Fertig",
        "https://example.org/a/b/pull/12",
        "https://github.com/a/b/issues/12",
        "https://github.com/a/b/pull/abc",
        "https://github.com/a/b/pull/0",
        "https://github.com/a/b/pull/12/extra",
        "https://github.com/a/b/pull/18446744073709551616",
    ] {
        let fehler = lies_ausgabe(true, Some(0), stdout, "Fehlerdetail").unwrap_err().to_string();
        assert!(fehler.contains("Fehlerdetail"), "{fehler}");
        assert!(fehler.contains("Exit-Code: 0"), "{fehler}");
    }
}

#[test]
fn fehlgeschlagener_prozess_bleibt_fehler_trotz_url() {
    for code in [Some(1), Some(4), None] {
        let fehler =
            lies_ausgabe(false, code, "https://github.com/a/b/pull/12", "Nicht angemeldet").unwrap_err().to_string();
        assert!(fehler.contains("Nicht angemeldet"), "{fehler}");
        assert!(fehler.contains(&code.map_or_else(|| "unbekannt".into(), |n| n.to_string())), "{fehler}");
    }
}
