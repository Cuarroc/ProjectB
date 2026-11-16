use projectb_kern::{
    start,
    team::{Team, TeamAuftrag},
    Anbieter,
};
use serde_json::Value;
use std::{fs, path::PathBuf, process::Command, sync::mpsc, time::Duration};

struct Repo(PathBuf);
impl Repo {
    fn neu() -> Self {
        static NR: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let pfad = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target").join(format!(
            "team-{}-{}",
            std::process::id(),
            NR.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir_all(&pfad).unwrap();
        for args in [
            vec!["init"],
            vec![
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "--allow-empty",
                "-m",
                "Start",
            ],
        ] {
            let ausgabe = Command::new("git").arg("-C").arg(&pfad).args(args).output().unwrap();
            assert!(ausgabe.status.success(), "{}", String::from_utf8_lossy(&ausgabe.stderr));
        }
        Self(fs::canonicalize(pfad).unwrap())
    }
}
impl Drop for Repo {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

fn auftrag(name: &str) -> TeamAuftrag {
    TeamAuftrag {
        name: name.into(),
        anbieter: "claude".into(),
        modell: "Opus 5.5".into(),
        effort: "Hoch".into(),
        text: "weiter".into(),
    }
}

fn starten(repo: &Repo, namen: &[&str]) -> (Team, mpsc::Receiver<String>) {
    let (tx, rx) = mpsc::channel();
    let team = Team::starten_mit(
        &repo.0,
        namen.iter().map(|n| auftrag(n)).collect(),
        move |json| tx.send(json).unwrap(),
        |a, w, pfad| {
            assert!(!w.nur_lesen);
            assert_eq!(w.modell.as_deref(), Some("claude-opus-5-5"));
            assert_eq!(w.effort, Some(start::Effort::Hoch));
            start::starten(
                &Anbieter { programm: env!("CARGO_BIN_EXE_test_agent"), argumente: &["--chat-live"], ..*a },
                w,
                pfad,
            )
        },
    )
    .unwrap();
    (team, rx)
}

fn bis_fertig(rx: &mpsc::Receiver<String>, ordner: &[PathBuf], anzahl: usize) -> Vec<Value> {
    let mut meldungen = Vec::new();
    while meldungen.iter().filter(|v: &&Value| v["zustand"] == "Fertig").count() < anzahl {
        let v: Value = serde_json::from_str(&rx.recv_timeout(Duration::from_secs(10)).unwrap()).unwrap();
        if v["liveZeile"] == "Auftrag: weiter" {
            let pfad = PathBuf::from(v["arbeitskopie"].as_str().unwrap());
            assert!(ordner.contains(&pfad));
            fs::write(pfad.join("weiter"), "live bestätigt").unwrap();
        }
        meldungen.push(v);
    }
    meldungen
}
fn datei_team(repo: &Repo, n: &str, args: &'static [&str], f: fn(&std::path::Path)) -> (Team, mpsc::Receiver<String>) {
    let (tx, rx) = mpsc::channel();
    let starten = |a: &Anbieter, w: &_, pfad: &std::path::Path| {
        f(pfad);
        let a = Anbieter { programm: env!("CARGO_BIN_EXE_test_agent"), argumente: args, ..*a };
        start::starten(&a, w, pfad)
    };
    let team = Team::starten_mit(&repo.0, vec![auftrag(n)], move |json| tx.send(json).unwrap(), starten).unwrap();
    (team, rx)
}
#[test]
fn dateien_werden_live_gemeldet_und_laufzeit_tickert() {
    let repo = Repo::neu();
    let (mut team, rx) = starten(&repo, &["eins"]);
    let mut tick = false;
    loop {
        let v: Value = serde_json::from_str(&rx.recv_timeout(Duration::from_secs(10)).unwrap()).unwrap();
        if !tick && v["laufzeitSekunden"].as_u64().unwrap() >= 2 {
            assert_eq!(v["zustand"], "Arbeitet");
            fs::write(team.ordner()[0].join("weiter"), "live bestätigt").unwrap();
            tick = true;
        }
        if v["zustand"] == "Fertig" {
            assert!(tick);
            assert_eq!(v["dateien"], serde_json::json!([{"pfad":"weiter", "hinzugefuegt":1, "entfernt":0}]));
            break;
        }
    }
    assert!(team.laeufe_mut()[0].warten().unwrap().success());
    assert!(matches!(rx.recv_timeout(Duration::from_secs(3)), Err(mpsc::RecvTimeoutError::Disconnected)));
}

#[test]
fn dateien_ohne_folgendes_ereignis_werden_live_gemeldet() {
    let repo = Repo::neu();
    let (mut team, rx) = datei_team(&repo, "still", &["--datei-ohne-ereignis"], |_| {});
    let frist = std::time::Instant::now() + Duration::from_secs(5);
    let gefunden = loop {
        let Ok(json) = rx.recv_timeout(frist.saturating_duration_since(std::time::Instant::now())) else {
            break false;
        };
        let v: Value = serde_json::from_str(&json).unwrap();
        if v["dateien"] == serde_json::json!([{"pfad":"still.txt", "hinzugefuegt":2, "entfernt":0}]) {
            assert_eq!(v["zustand"], "Arbeitet");
            break true;
        }
    };
    fs::write(team.ordner()[0].join("weiter"), "weiter").unwrap();
    bis_fertig(&rx, team.ordner(), 1);
    assert!(team.laeufe_mut()[0].warten().unwrap().success());
    assert!(gefunden, "Keine Dateimeldung innerhalb von fünf Sekunden");
}

#[test]
fn gitfehler_erhalten_den_letzten_stand() {
    let repo = Repo::neu();
    let (mut team, rx) = datei_team(&repo, "eins", &["--chat-live"], |pfad| {
        fs::write(pfad.join("vorher"), "eins\n").unwrap();
    });
    let erwartet = serde_json::json!([{"pfad":"vorher", "hinzugefuegt":1, "entfernt":0}]);
    loop {
        let v: Value = serde_json::from_str(&rx.recv_timeout(Duration::from_secs(10)).unwrap()).unwrap();
        if v["dateien"] == erwartet {
            assert_eq!(v["zustand"], "Arbeitet");
            fs::write(team.ordner()[0].join(".git"), "ungültig").unwrap();
            fs::write(team.ordner()[0].join("weiter"), "weiter").unwrap();
            break;
        }
    }
    let meldungen = bis_fertig(&rx, team.ordner(), 1);
    assert_eq!(meldungen.last().unwrap()["dateien"], erwartet);
    assert!(team.laeufe_mut()[0].warten().unwrap().success());
}

#[test]
fn zwei_agenten_arbeiten_live_in_eigenen_worktrees() {
    let repo = Repo::neu();
    let (mut team, rx) = starten(&repo, &["eins", "zwei"]);
    assert_eq!(team.ordner().len(), 2);
    let meldungen = bis_fertig(&rx, team.ordner(), 2);
    for name in ["eins", "zwei"] {
        let pfad = fs::canonicalize(repo.0.join(".worktrees").join(name)).unwrap();
        assert!(team.ordner().contains(&pfad));
        for zustand in ["Arbeitet", "Fertig"] {
            assert!(meldungen.iter().any(|v| v["id"] == name
                && v["zustand"] == zustand
                && v["arbeitskopie"] == pfad.to_string_lossy().as_ref()));
        }
    }
    assert_eq!(team.laeufe_mut().len(), 2);
    for lauf in team.laeufe_mut() {
        assert!(lauf.warten().unwrap().success());
    }
}

#[test]
fn vier_auftraege_starten_nichts() {
    let repo = Repo::neu();
    assert!(Team::starten(&repo.0, ["a", "b", "c", "d"].map(auftrag).into(), |_| panic!("kein Start")).is_err());
    assert!(!repo.0.join(".worktrees").exists());
    assert_eq!(projectb_kern::arbeitskopie::liste(&repo.0).unwrap().len(), 1);
}

#[test]
fn ungueltiger_name_stoert_den_anderen_agenten_nicht() {
    let repo = Repo::neu();
    let (mut team, rx) = starten(&repo, &["../falsch", "gut"]);
    let meldungen = bis_fertig(&rx, team.ordner(), 1);
    assert!(meldungen.iter().any(|v| v["id"] == "../falsch"
        && v["zustand"] == "Problem"
        && v["liveZeile"].as_str().is_some_and(|s| !s.is_empty())));
    assert_eq!(team.ordner().len(), 1);
    assert!(team.laeufe_mut()[0].warten().unwrap().success());
}

#[test]
fn doppelte_namen_starten_nichts() {
    let repo = Repo::neu();
    let starts = std::cell::Cell::new(0);
    let ergebnis = Team::starten_mit(
        &repo.0,
        ["gut", "doppelt", "doppelt"].map(auftrag).into(),
        |_| {},
        |_, _, _| {
            starts.set(starts.get() + 1);
            Err(std::io::Error::other("kein echter Prozess"))
        },
    );
    assert_eq!(starts.get(), 0);
    assert_eq!(ergebnis.err().unwrap().kind(), std::io::ErrorKind::InvalidInput);
    assert!(!repo.0.join(".worktrees").exists());
    assert_eq!(projectb_kern::arbeitskopie::liste(&repo.0).unwrap().len(), 1);
}

#[test]
fn team_kontingent_wird_wie_im_chat_gespeichert() {
    let repo = Repo::neu();
    let datei = repo.0.join("kontingent.json");
    let (tx, rx) = mpsc::channel();
    let mut team = Team::starten_mit_kontingent(
        &repo.0,
        vec![auftrag("eins")],
        Some(&datei),
        move |json| tx.send(json).unwrap(),
        |a, w, pfad| {
            start::starten(
                &Anbieter { programm: env!("CARGO_BIN_EXE_test_agent"), argumente: &["--kontingent"], ..*a },
                w,
                pfad,
            )
        },
    )
    .unwrap();
    bis_fertig(&rx, team.ordner(), 1);
    assert!(team.laeufe_mut()[0].warten().unwrap().success());
    assert_eq!(
        projectb_kern::verbrauch::laden(&datei).get("claude"),
        Some(&projectb_kern::verbrauch::Stand { prozent: 8, endet: 4_000_000_000 })
    );
}

fn git(pfad: &std::path::Path, args: &[&str]) -> String {
    let ausgabe = Command::new("git").arg("-C").arg(pfad).args(args).output().unwrap();
    assert!(ausgabe.status.success(), "{}", String::from_utf8_lossy(&ausgabe.stderr));
    String::from_utf8(ausgabe.stdout).unwrap().trim().into()
}

fn haengendes_team(repo: &Repo, namen: &[&str]) -> Team {
    git(&repo.0, &["config", "user.name", "Test"]);
    git(&repo.0, &["config", "user.email", "test@example.invalid"]);
    git(&repo.0, &["config", "commit.gpgSign", "false"]);
    let team = Team::starten_mit(
        &repo.0,
        namen.iter().map(|n| auftrag(n)).collect(),
        |_| {},
        |a, w, pfad| {
            if pfad.ends_with("startfehler") {
                return Err(std::io::Error::other("Start fehlgeschlagen"));
            }
            start::starten(
                &Anbieter {
                    programm: env!("CARGO_BIN_EXE_test_agent"),
                    argumente: &["--team-arbeit", "--haengen"],
                    ..*a
                },
                w,
                pfad,
            )
        },
    )
    .unwrap();
    let frist = std::time::Instant::now() + Duration::from_secs(5);
    for pfad in team.ordner().iter().filter(|p| !p.ends_with("startfehler")) {
        while fs::read_to_string(pfad.join("arbeit.txt")).ok().as_deref() != Some("Agentenarbeit") {
            assert!(std::time::Instant::now() < frist, "Agent hat nicht geschrieben");
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    team
}

#[test]
fn alles_anhalten_sichert_arbeit_und_neustart_erhaelt_alten_branch() {
    let repo = Repo::neu();
    let mut team = haengendes_team(&repo, &["x", "y"]);
    assert!(team.laeuft());
    let bericht = team.anhalten(None, Duration::from_secs(30)).unwrap();
    assert!(!team.laeuft());
    assert!(!team.laeufe_mut()[0].warten().unwrap().success());
    assert!(bericht.lauffehler.is_empty());
    assert!(!bericht.frist_ueberschritten);
    assert_eq!(bericht.ordner.len(), 2);
    assert!(bericht.ordner.iter().all(|o| matches!(o.status, projectb_kern::anhalten::Ordnerstatus::Gesichert { .. })));
    let sha = git(&repo.0, &["rev-parse", "agent/x"]);
    assert_eq!(bericht.ordner[0].status, projectb_kern::anhalten::Ordnerstatus::Gesichert { sha: sha.clone() });
    assert_eq!(git(&repo.0, &["show", "agent/x:arbeit.txt"]), "Agentenarbeit");
    assert!(git(&repo.0, &["log", "-1", "--format=%s", "agent/x"]).starts_with("WIP:"));
    let (mut neu, rx) = starten(&repo, &["x"]);
    assert!(neu.ordner()[0].ends_with(".worktrees/x-2"));
    let meldungen = bis_fertig(&rx, neu.ordner(), 1);
    assert!(meldungen.iter().all(|v| v["id"] == "x" && v["name"] == "x"));
    neu.laeufe_mut()[0].warten().unwrap();
    assert!(!neu.laeuft());
    assert_eq!(git(&repo.0, &["rev-parse", "agent/x"]), sha);
}

#[test]
fn einzeln_anhalten_trifft_nur_den_benannten_agenten() {
    let repo = Repo::neu();
    let mut team = haengendes_team(&repo, &["eins", "zwei"]);
    assert_eq!(team.anhalten(Some("unbekannt"), Duration::ZERO).unwrap_err().kind(), std::io::ErrorKind::InvalidInput);
    let bericht = team.anhalten(Some("eins"), Duration::from_secs(30)).unwrap();
    assert_eq!(bericht.ordner.len(), 1);
    assert_eq!(bericht.ordner[0].ordner, team.ordner()[0]);
    assert!(matches!(bericht.ordner[0].status, projectb_kern::anhalten::Ordnerstatus::Gesichert { .. }));
    assert!(team.laeufe_mut()[0].beendet());
    assert!(!team.laeufe_mut()[1].beendet());
    assert!(team.laeuft());
    team.anhalten(None, Duration::from_secs(30)).unwrap();
    assert!(!team.laeuft());
}

#[test]
fn startfehler_verschiebt_die_zuordnung_nicht() {
    let repo = Repo::neu();
    let mut team = haengendes_team(&repo, &["startfehler", "gut"]);
    let bericht = team.anhalten(Some("startfehler"), Duration::from_secs(30)).unwrap();
    assert_eq!(bericht.ordner[0].ordner, team.ordner()[0]);
    assert!(team.laeuft());
    let bericht = team.anhalten(Some("gut"), Duration::from_secs(30)).unwrap();
    assert_eq!(bericht.ordner[0].ordner, team.ordner()[1]);
    assert!(!team.laeuft());
}

#[test]
fn leere_auftragsliste_wird_abgelehnt() {
    let repo = Repo::neu();
    let fehler = Team::starten(&repo.0, vec![], |_| panic!("kein Start")).err().unwrap();
    assert_eq!(fehler.kind(), std::io::ErrorKind::InvalidInput);
    assert!(fehler.to_string().contains("Mindestens ein Auftrag"));
}

#[test]
fn vorhandener_branch_oder_ordner_wird_uebersprungen() {
    for branch in [true, false] {
        let repo = Repo::neu();
        let vorher = git(&repo.0, &["rev-parse", "HEAD"]);
        if branch {
            git(&repo.0, &["branch", "agent/x"]);
        } else {
            fs::create_dir_all(repo.0.join(".worktrees/x")).unwrap();
        }
        fs::create_dir_all(repo.0.join(".worktrees/x-2")).unwrap();
        let team = Team::starten_mit(&repo.0, vec![auftrag("x")], |_| {}, |_, _, _| Err(std::io::Error::other("Test")))
            .unwrap();
        assert_eq!(team.ordner().len(), 1);
        assert!(team.ordner()[0].ends_with(".worktrees/x-3"));
        assert_eq!(git(team.ordner().first().unwrap(), &["branch", "--show-current"]), "agent/x-3");
        if branch {
            assert_eq!(git(&repo.0, &["rev-parse", "agent/x"]), vorher);
        }
    }
}
