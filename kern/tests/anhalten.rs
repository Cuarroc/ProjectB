use projectb_kern::anhalten::{alles_anhalten, Ordnerstatus, STANDARD_FRIST};
use projectb_kern::{Anbieter, Lauf};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

struct Temp(PathBuf);
impl Temp {
    fn neu() -> Self {
        let zeit = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let pfad = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target/anhalten-tests")
            .join(format!("{}-{zeit}", std::process::id()));
        fs::create_dir_all(&pfad).unwrap();
        Self(pfad)
    }

    fn repo(&self, name: &str) -> PathBuf {
        let pfad = self.0.join(name);
        fs::create_dir(&pfad).unwrap();
        git(&pfad, &["init"]);
        git(&pfad, &["config", "user.name", "Test"]);
        git(&pfad, &["config", "user.email", "test@example.invalid"]);
        git(&pfad, &["config", "commit.gpgSign", "false"]);
        fs::write(pfad.join("alt.txt"), "vorher").unwrap();
        git(&pfad, &["add", "-A"]);
        git(&pfad, &["commit", "--no-verify", "-m", "Anfang"]);
        pfad
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

fn git(pfad: &Path, argumente: &[&str]) -> String {
    let ausgabe = Command::new("git").arg("-C").arg(pfad).args(argumente).output().unwrap();
    assert!(ausgabe.status.success(), "{}", String::from_utf8_lossy(&ausgabe.stderr));
    String::from_utf8(ausgabe.stdout).unwrap().trim().to_owned()
}

#[test]
fn sichert_neue_und_geaenderte_dateien_und_laesst_sauberes_repo_unberuehrt() {
    let temp = Temp::neu();
    let schmutzig = temp.repo("Mit Leerzeichen ä");
    let sauber = temp.repo("sauber");
    let vorher = git(&sauber, &["rev-parse", "HEAD"]);
    fs::write(schmutzig.join("alt.txt"), "nachher").unwrap();
    fs::write(schmutzig.join("neu.txt"), "neu").unwrap();
    // Ein fehlschlagender Hook darf den Stopp nicht verhindern.
    fs::write(schmutzig.join(".git/hooks/pre-commit"), "#!/bin/sh\nexit 1\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(schmutzig.join(".git/hooks/pre-commit"), fs::Permissions::from_mode(0o755)).unwrap();
    }
    let start = Instant::now();
    let bericht = alles_anhalten(vec![], &[schmutzig.clone(), sauber.clone()], STANDARD_FRIST);
    let sha = git(&schmutzig, &["rev-parse", "HEAD"]);
    assert_eq!(bericht.ordner[0].ordner, schmutzig);
    assert_eq!(bericht.ordner[0].status, Ordnerstatus::Gesichert { sha });
    assert_eq!(bericht.ordner[1].status, Ordnerstatus::Sauber);
    assert_eq!(git(&sauber, &["rev-parse", "HEAD"]), vorher);
    assert_eq!(git(&schmutzig, &["rev-list", "--count", "HEAD"]), "2");
    assert!(git(&schmutzig, &["log", "-1", "--format=%s"]).starts_with("WIP: angehalten "));
    assert_eq!(git(&schmutzig, &["show", "HEAD:alt.txt"]), "nachher");
    assert_eq!(git(&schmutzig, &["show", "HEAD:neu.txt"]), "neu");
    assert!(git(&schmutzig, &["status", "--porcelain"]).is_empty());
    assert_eq!(fs::read_to_string(schmutzig.join("alt.txt")).unwrap(), "nachher");
    assert_eq!(fs::read_to_string(schmutzig.join("neu.txt")).unwrap(), "neu");
    assert_eq!(fs::read_to_string(sauber.join("alt.txt")).unwrap(), "vorher");
    assert!(bericht.lauffehler.is_empty());
    assert!(bericht.dauer <= start.elapsed());
    assert_eq!(bericht.frist_ueberschritten, bericht.dauer > STANDARD_FRIST);
    assert_eq!(STANDARD_FRIST, Duration::from_secs(30));
}

#[test]
fn sichert_neue_datei_auch_bei_ausgeblendeten_unverfolgten_dateien() {
    let temp = Temp::neu();
    let repo = temp.repo("neue-datei");
    git(&repo, &["config", "status.showUntrackedFiles", "no"]);
    fs::write(repo.join("neu.txt"), "neu").unwrap();
    assert!(git(&repo, &["status", "--porcelain"]).is_empty());

    let bericht = alles_anhalten(vec![], std::slice::from_ref(&repo), STANDARD_FRIST);

    let sha = git(&repo, &["rev-parse", "HEAD"]);
    assert_eq!(bericht.ordner[0].status, Ordnerstatus::Gesichert { sha });
    assert_eq!(git(&repo, &["rev-list", "--count", "HEAD"]), "2");
    assert!(git(&repo, &["log", "-1", "--format=%s"]).starts_with("WIP: angehalten "));
    assert_eq!(git(&repo, &["show", "HEAD:neu.txt"]), "neu");
    assert!(git(&repo, &["status", "--porcelain", "--untracked-files=all"]).is_empty());
}

#[test]
fn fehler_in_einem_ordner_verhindern_keine_weitere_sicherung() {
    let temp = Temp::neu();
    let kein_repo = temp.0.join("kein-repo");
    fs::create_dir(&kein_repo).unwrap();
    fs::write(kein_repo.join("bleibt.txt"), "bleibt").unwrap();
    let kaputt = temp.repo("commit-fehler");
    git(&kaputt, &["config", "user.name", ""]);
    fs::write(kaputt.join("neu.txt"), "bleibt auch").unwrap();
    let repo = temp.repo("danach");
    fs::write(repo.join("neu.txt"), "gesichert").unwrap();
    let bericht = alles_anhalten(vec![], &[kein_repo.clone(), kaputt.clone(), repo.clone()], Duration::ZERO);
    for eintrag in &bericht.ordner[..2] {
        assert!(matches!(&eintrag.status, Ordnerstatus::Fehler { meldung } if !meldung.is_empty()));
    }
    assert!(matches!(bericht.ordner[2].status, Ordnerstatus::Gesichert { .. }));
    assert!(bericht.frist_ueberschritten);
    assert_eq!(fs::read_to_string(kein_repo.join("bleibt.txt")).unwrap(), "bleibt");
    assert_eq!(fs::read_to_string(kaputt.join("neu.txt")).unwrap(), "bleibt auch");
    assert_eq!(fs::read_to_string(repo.join("neu.txt")).unwrap(), "gesichert");
}

#[test]
fn haelt_alle_lauefe_vor_der_sicherung_an() {
    let temp = Temp::neu();
    let repo = temp.repo("lauf");
    let anbieter = Anbieter {
        name: "Testprozess",
        programm: if cfg!(windows) { "ping" } else { "sleep" },
        argumente: if cfg!(windows) { &["-n", "60", "127.0.0.1"] } else { &["60"] },
        lesen: |_| vec![],
    };
    let mut erster = Lauf::starten(&anbieter, "", &repo).unwrap();
    let mut zweiter = Lauf::starten(&anbieter, "", &repo).unwrap();
    fs::write(repo.join("neu.txt"), "bleibt").unwrap();
    let bericht = alles_anhalten(vec![&mut erster, &mut zweiter], &[repo], STANDARD_FRIST);
    assert!(bericht.lauffehler.is_empty(), "{:?}", bericht.lauffehler);
    assert!(!erster.warten().unwrap().success());
    assert!(!zweiter.warten().unwrap().success());
    assert!(matches!(bericht.ordner[0].status, Ordnerstatus::Gesichert { .. }));
}
