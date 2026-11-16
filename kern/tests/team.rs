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
