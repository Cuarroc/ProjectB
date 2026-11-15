use projectb_kern::projekt::{pruefen, zuletzt_laden, zuletzt_merken};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicUsize, Ordering},
};

struct Ordner(PathBuf);
impl Ordner {
    fn neu() -> Self {
        static NR: AtomicUsize = AtomicUsize::new(0);
        let pfad = Path::new(env!("CARGO_MANIFEST_DIR")).join("target").join(format!(
            "projekt test ü {} {}",
            std::process::id(),
            NR.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&pfad).unwrap();
        Self(pfad)
    }
    fn git(&self, args: &[&str]) -> String {
        let ausgabe = Command::new("git").arg("-C").arg(&self.0).args(args).output().unwrap();
        assert!(ausgabe.status.success(), "{}", String::from_utf8_lossy(&ausgabe.stderr));
        String::from_utf8(ausgabe.stdout).unwrap().trim_end_matches(['\r', '\n']).into()
    }
}
impl Drop for Ordner {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn wurzel_unterordner_und_detached_head() {
    let repo = Ordner::neu();
    repo.git(&["init", "-b", "projekt-test"]);
    let unterordner = repo.0.join("unter ordner");
    fs::create_dir(&unterordner).unwrap();
    for pfad in [&repo.0, &unterordner, &fs::canonicalize(&unterordner).unwrap()] {
        let projekt = pruefen(pfad).unwrap();
        assert_eq!(projekt.projekt, repo.0.file_name().unwrap().to_str().unwrap());
        assert_eq!(fs::canonicalize(projekt.pfad).unwrap(), fs::canonicalize(&repo.0).unwrap());
        assert_eq!(projekt.zweig, "projekt-test");
    }
    repo.git(&[
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--allow-empty",
        "-m",
        "Start",
    ]);
    assert_eq!(pruefen(&repo.0).unwrap().zweig, "projekt-test");
    repo.git(&["checkout", "--detach"]);
    assert_eq!(pruefen(&unterordner).unwrap().zweig, repo.git(&["rev-parse", "--short", "HEAD"]));
}

#[test]
#[cfg(unix)]
fn wurzel_mit_zeilenumbruch_im_namen() {
    let basis = Ordner::neu();
    for name in ["repo\n", "repo\r"] {
        let repo = Ordner(basis.0.join(name));
        fs::create_dir(&repo.0).unwrap();
        repo.git(&["init", "-b", "test"]);
        let projekt = pruefen(&repo.0).unwrap();
        assert_eq!(projekt.projekt, name);
        assert_eq!(fs::canonicalize(projekt.pfad).unwrap(), fs::canonicalize(&repo.0).unwrap());
    }
}

#[test]
fn ordnerfehler_und_fehlendes_git() {
    let ordner = Ordner::neu();
    if let Ok(modus) = std::env::var("PROJECTB_TEST_GIT") {
        let fehler = pruefen(&ordner.0).unwrap_err().to_string();
        assert!(fehler.contains(if modus == "fehlt" { "Git nicht gefunden" } else { "kein Git-Repo" }), "{fehler}");
        assert!(pruefen(ordner.0.join("fehlt")).unwrap_err().to_string().contains("Ordner fehlt"));
        fs::write(ordner.0.join("datei"), "keine Mappe").unwrap();
        assert!(pruefen(ordner.0.join("datei")).is_err());
        return;
    }
    for modus in ["kein-repo", "fehlt"] {
        let mut befehl = Command::new(std::env::current_exe().unwrap());
        befehl
            .args(["--exact", "ordnerfehler_und_fehlendes_git", "--nocapture"])
            .env("PROJECTB_TEST_GIT", modus)
            .env("GIT_CEILING_DIRECTORIES", ordner.0.parent().unwrap());
        if modus == "fehlt" {
            befehl.env("PATH", "").current_dir(&ordner.0);
        }
        let ausgabe = befehl.output().unwrap();
        assert!(
            ausgabe.status.success(),
            "{}{}",
            String::from_utf8_lossy(&ausgabe.stdout),
            String::from_utf8_lossy(&ausgabe.stderr)
        );
    }
}

#[test]
fn zuletzt_neu_oben_ohne_doppelte_und_hoechstens_zehn() {
    let ordner = Ordner::neu();
    let datei = ordner.0.join("zuletzt.json");
    assert!(zuletzt_laden(&datei).is_empty());
    for i in 0..12 {
        zuletzt_merken(&datei, &format!(r"C:\Projekt {i}")).unwrap();
    }
    zuletzt_merken(&datei, r"c:/pROJEKT 5").unwrap();
    zuletzt_merken(&datei, r"c:/pROJEKT 5").unwrap();
    let liste = zuletzt_laden(&datei);
    let mut erwartet = vec![r"c:/pROJEKT 5".to_owned()];
    erwartet.extend((2..12).rev().filter(|i| *i != 5).map(|i| format!(r"C:\Projekt {i}")));
    assert_eq!(liste, erwartet);
    assert_eq!(fs::read_dir(&ordner.0).unwrap().count(), 1);
    assert_eq!(serde_json::from_slice::<Vec<String>>(&fs::read(&datei).unwrap()).unwrap(), liste);
    for (a, b) in [(r"\\Server\Projekte\Ä", r"\\server\projekte\ä"), ("/Projekt", "/projekt")] {
        fs::write(&datei, "[]").unwrap();
        zuletzt_merken(&datei, a).unwrap();
        zuletzt_merken(&datei, b).unwrap();
        let doppelt = a.starts_with(r"\\") || cfg!(windows);
        assert_eq!(zuletzt_laden(&datei).len(), if doppelt { 1 } else { 2 });
    }
}

#[test]
fn kaputte_dateien_und_schreibfehler() {
    let ordner = Ordner::neu();
    let datei = ordner.0.join("zuletzt.json");
    for inhalt in ["{", "null", "{}", "42", r#"["gut", 3]"#] {
        fs::write(&datei, inhalt).unwrap();
        assert!(zuletzt_laden(&datei).is_empty());
    }
    zuletzt_merken(&datei, "Projekt").unwrap();
    assert_eq!(zuletzt_laden(&datei), ["Projekt"]);
    assert!(zuletzt_merken(datei.join("fehlt.json"), "Projekt").is_err());
    assert_eq!(zuletzt_laden(&datei), ["Projekt"]);
    fs::remove_file(&datei).unwrap();
    fs::create_dir(&datei).unwrap();
    fs::write(datei.join("behalten"), "Arbeit").unwrap();
    assert!(zuletzt_merken(&datei, "Projekt").is_err());
    assert_eq!(fs::read_to_string(datei.join("behalten")).unwrap(), "Arbeit");
    assert_eq!(fs::read_dir(&ordner.0).unwrap().count(), 1);
}
