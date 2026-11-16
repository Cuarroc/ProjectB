use std::io::{self, BufRead, Read};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Arbeitskopie {
    pub pfad: PathBuf,
    pub branch: Option<String>,
}

/// Änderungen gegen HEAD samt neuen Dateien; unlesbare Einträge mit 0/0.
pub fn geaenderte_dateien(repo: &Path) -> io::Result<Vec<serde_json::Value>> {
    geaenderte_dateien_seit(repo, "HEAD")
}

/// Wie `geaenderte_dateien`, aber gegen einen festen Start-Commit (bleibt nach WIP-Commits gleich).
pub fn geaenderte_dateien_seit(repo: &Path, basis: &str) -> io::Result<Vec<serde_json::Value>> {
    let diff = ausfuehren(git(repo).args(["diff", "--numstat", "-z", basis, "--"]))?;
    let neue = ausfuehren(git(repo).args(["ls-files", "--others", "--exclude-standard", "-z"]))?;
    let diff = String::from_utf8(diff).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let neue = String::from_utf8(neue).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let mut dateien = Vec::new();
    let mut eintraege = diff.split_terminator('\0');
    while let Some(zeile) = eintraege.next() {
        if dateien.len() == 50 {
            break;
        }
        let mut felder = zeile.splitn(3, '\t');
        // Git meldet bei Binärdateien statt Zeilenzahlen jeweils „-“.
        let hinzugefuegt = felder.next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
        let entfernt = felder.next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
        let mut pfad = felder.next().ok_or_else(|| io::Error::other("Ungültiger Git-numstat"))?;
        if pfad.is_empty() {
            eintraege.next(); // Umbenennung mit -z: alter und neuer Pfad folgen als eigene Felder.
            pfad = eintraege.next().ok_or_else(|| io::Error::other("Git-Zielpfad fehlt"))?;
        }
        dateien.push(serde_json::json!({"pfad":pfad, "hinzugefuegt":hinzugefuegt, "entfernt":entfernt}));
    }
    for pfad in neue.split('\0').filter(|s| !s.is_empty()).take(50 - dateien.len()) {
        let zeilen = zeilen_neuer_datei(&repo.join(pfad)).unwrap_or(0);
        dateien.push(serde_json::json!({"pfad":pfad, "hinzugefuegt":zeilen, "entfernt":0}));
    }
    Ok(dateien)
}

fn zeilen_neuer_datei(pfad: &Path) -> io::Result<u64> {
    if !std::fs::symlink_metadata(pfad)?.is_file() {
        return Ok(0);
    }
    let mut datei = std::fs::File::open(pfad)?;
    let mut anfang = Vec::new();
    datei.by_ref().take(8000).read_to_end(&mut anfang)?;
    if anfang.contains(&0) {
        return Ok(0);
    }
    let datei = io::BufReader::new(io::Cursor::new(anfang).chain(datei));
    datei.split(b'\n').try_fold(0u64, |n, zeile| zeile.map(|_| n + 1))
}

/// Legt eine Arbeitskopie von HEAD unter `<repo>/.worktrees/<name>` an.
pub fn anlegen(repo: &Path, name: &str) -> io::Result<Arbeitskopie> {
    anlegen_in(repo, name, Path::new(".worktrees")).map(|(kopie, _)| kopie)
}

/// Liefert Arbeitskopie und Start-Commit; relative Zielordner beziehen sich auf `repo`.
pub fn anlegen_in(repo: &Path, name: &str, ordner: &Path) -> io::Result<(Arbeitskopie, String)> {
    if name.is_empty() || name.contains("..") || name.contains(['/', '\\']) || name.starts_with('-') {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Ungültiger Name der Arbeitskopie"));
    }
    let mut branch = format!("agent/{name}");
    ausfuehren(git(repo).args(["check-ref-format", &format!("refs/heads/{branch}")]))
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "Ungültiger Branchname"))?;
    let basis = std::fs::canonicalize(repo)?.join(ordner);
    let mut pfad = basis.join(name);
    let mut nummer = 2;
    loop {
        let status = git(repo).args(["show-ref", "--verify", "--quiet", &format!("refs/heads/{branch}")]).status()?;
        match status.code() {
            Some(1) if !pfad.try_exists()? => break,
            Some(0 | 1) => {}
            _ => return Err(io::Error::other(format!("Git-Branchprüfung fehlgeschlagen: {status}"))),
        }
        branch = format!("agent/{name}-{nummer}");
        pfad = basis.join(format!("{name}-{nummer}"));
        nummer += 1;
    }
    let start = String::from_utf8(ausfuehren(git(repo).args(["rev-parse", "HEAD"]))?)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    ausfuehren(git(repo).args(["worktree", "add", "-b", &branch]).arg(git_pfad(&pfad)).arg(start.trim()))?;
    Ok((Arbeitskopie { pfad: std::fs::canonicalize(pfad)?, branch: Some(branch) }, start.trim().to_owned()))
}

/// Enthält auch die Hauptarbeitskopie; abgelöste HEADs haben keinen Branch.
pub fn liste(repo: &Path) -> io::Result<Vec<Arbeitskopie>> {
    // -z bewahrt Leerzeichen, Umlaute und Zeilenumbrüche in Pfaden ohne Git-Quoting.
    let bytes = ausfuehren(git(repo).args(["worktree", "list", "--porcelain", "-z"]))?;
    let text = String::from_utf8(bytes).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let mut kopien: Vec<Arbeitskopie> = Vec::new();
    for feld in text.split('\0') {
        if let Some(pfad) = feld.strip_prefix("worktree ") {
            let pfad = PathBuf::from(pfad);
            kopien.push(Arbeitskopie { pfad: std::fs::canonicalize(&pfad).unwrap_or(pfad), branch: None });
        } else if let Some(branch) = feld.strip_prefix("branch refs/heads/") {
            if let Some(kopie) = kopien.last_mut() {
                kopie.branch = Some(branch.to_owned());
            }
        }
    }
    Ok(kopien)
}

/// Verweigert das Entfernen bei Änderungen, neuen oder ignorierten Dateien.
pub fn entfernen(repo: &Path, kopie: &Arbeitskopie) -> io::Result<()> {
    if !liste(repo)?.contains(kopie) {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Arbeitskopie gehört nicht zu diesem Repository"));
    }
    let status = ausfuehren(git(&kopie.pfad).args([
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--ignored",
        "--ignore-submodules=none",
    ]))?;
    if !status.is_empty() {
        return Err(io::Error::other("Uncommittete oder ignorierte Dateien: Arbeitskopie bleibt erhalten"));
    }
    // Kein --force: Git prüft den Zustand vor dem Entfernen nochmals selbst.
    ausfuehren(git(repo).args(["worktree", "remove"]).arg(git_pfad(&kopie.pfad)))?;
    Ok(())
}

fn git(repo: &Path) -> Command {
    let mut befehl = Command::new("git");
    befehl.arg("-C").arg(git_pfad(repo));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        befehl.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    befehl
}

fn git_pfad(pfad: &Path) -> PathBuf {
    #[cfg(windows)]
    if let Some(text) = pfad.to_str().and_then(|s| s.strip_prefix(r"\\?\")) {
        return match text.strip_prefix(r"UNC\") {
            Some(unc) => PathBuf::from(format!(r"\\{unc}")),
            None => PathBuf::from(text),
        };
    }
    pfad.to_owned()
}

fn ausfuehren(befehl: &mut Command) -> io::Result<Vec<u8>> {
    let ausgabe = befehl.output()?;
    if !ausgabe.status.success() {
        return Err(io::Error::other(format!(
            "Git fehlgeschlagen: {}",
            String::from_utf8_lossy(&ausgabe.stderr).trim()
        )));
    }
    Ok(ausgabe.stdout)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct TempRepo(PathBuf);
    impl TempRepo {
        fn neu() -> Self {
            static NUMMER: AtomicUsize = AtomicUsize::new(0);
            let pfad = Path::new(env!("CARGO_MANIFEST_DIR")).join("target").join(format!(
                "arbeitskopie test ü {} {}",
                std::process::id(),
                NUMMER.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&pfad).unwrap();
            let repo = Self(fs::canonicalize(pfad).unwrap());
            repo.git(&["init"]);
            repo.commit();
            repo
        }
        fn commit(&self) {
            self.git(&[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "--allow-empty",
                "-m",
                "Start",
            ]);
        }
        fn git(&self, args: &[&str]) -> String {
            let ausgabe = Command::new("git").arg("-C").arg(&self.0).args(args).output().unwrap();
            assert!(ausgabe.status.success(), "{}", String::from_utf8_lossy(&ausgabe.stderr));
            String::from_utf8(ausgabe.stdout).unwrap().trim().to_owned()
        }
    }
    impl Drop for TempRepo {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }
    fn e(pfad: &str, plus: u64, minus: u64) -> serde_json::Value {
        serde_json::json!({"pfad":pfad, "hinzugefuegt":plus, "entfernt":minus})
    }
    #[test]
    fn geaenderte_und_neue_dateien_mit_zeilenzahlen() {
        let repo = TempRepo::neu();
        fs::write(repo.0.join("alt.txt"), "eins\nzwei\n").unwrap();
        repo.git(&["add", "alt.txt"]);
        repo.commit();
        fs::write(repo.0.join("alt.txt"), "eins\ndrei\nvier\n").unwrap();
        let neuer_pfad = if cfg!(windows) { "neu ü.txt" } else { "neu ü\t.txt" };
        fs::write(repo.0.join(neuer_pfad), "a\nb").unwrap();
        assert_eq!(geaenderte_dateien(&repo.0).unwrap(), vec![e("alt.txt", 2, 1), e(neuer_pfad, 2, 0)]);
        for nr in 0..55 {
            fs::write(repo.0.join(format!("neu-{nr}")), "").unwrap();
        }
        assert_eq!(geaenderte_dateien(&repo.0).unwrap().len(), 50);
        assert!(geaenderte_dateien(&repo.0.join("fehlt")).is_err());
    }

    #[test]
    fn neue_binaerdateien_pruefen_nur_die_ersten_8000_bytes() {
        let repo = TempRepo::neu();
        fs::write(repo.0.join("bild"), b"eins\n\0zwei\n").unwrap();
        fs::write(repo.0.join("rand"), [vec![b'x'; 7999], vec![0]].concat()).unwrap();
        let mut text = b"a\n".repeat(20_000);
        text[8000] = 0;
        fs::write(repo.0.join("text"), text).unwrap();
        assert_eq!(geaenderte_dateien(&repo.0).unwrap(), vec![e("bild", 0, 0), e("rand", 0, 0), e("text", 20_000, 0)]);
    }

    #[test]
    fn umbenennungen_und_binaerdateien() {
        let repo = TempRepo::neu();
        fs::write(repo.0.join("alt"), "Inhalt\n").unwrap();
        fs::write(repo.0.join("bild"), b"\0alt").unwrap();
        repo.git(&["add", "."]);
        repo.commit();
        repo.git(&["mv", "alt", "neu ü"]);
        fs::write(repo.0.join("bild"), b"\0neu").unwrap();
        let dateien = geaenderte_dateien(&repo.0).unwrap();
        assert!(dateien.contains(&e("neu ü", 0, 0)) && dateien.contains(&e("bild", 0, 0)));
    }

    #[test]
    #[cfg(unix)]
    fn neue_symlinks_und_unlesbare_dateien() {
        let repo = TempRepo::neu();
        fs::write(repo.0.join("text"), "eins\nzwei\n").unwrap();
        std::os::unix::fs::symlink("text", repo.0.join("link")).unwrap();
        std::os::unix::fs::symlink("fehlt", repo.0.join("kaputt")).unwrap();
        assert_eq!(geaenderte_dateien(&repo.0).unwrap(), vec![e("kaputt", 0, 0), e("link", 0, 0), e("text", 2, 0)]);
        use std::os::unix::fs::PermissionsExt;
        let repo = TempRepo::neu();
        let gesperrt = repo.0.join("gesperrt");
        fs::write(&gesperrt, "geheim\n").unwrap();
        fs::set_permissions(&gesperrt, fs::Permissions::from_mode(0o000)).unwrap();
        if fs::File::open(&gesperrt).is_ok() {
            return; // Root liest trotz Modus 000: der Fall lässt sich hier nicht herstellen.
        }
        fs::write(repo.0.join("text"), "eins\n").unwrap();
        assert_eq!(geaenderte_dateien(&repo.0).unwrap(), vec![e("gesperrt", 0, 0), e("text", 1, 0)]);
    }

    #[test]
    fn anlegen_listen_entfernen() {
        let repo = TempRepo::neu();
        let kopie = anlegen(&repo.0, "codex").unwrap();
        assert_eq!(kopie.pfad, fs::canonicalize(repo.0.join(".worktrees/codex")).unwrap());
        assert_eq!(kopie.branch.as_deref(), Some("agent/codex"));
        let head = Command::new("git").arg("-C").arg(&kopie.pfad).args(["rev-parse", "HEAD"]).output().unwrap();
        assert!(head.status.success());
        assert_eq!(String::from_utf8(head.stdout).unwrap().trim(), repo.git(&["rev-parse", "HEAD"]));
        assert!(liste(&repo.0).unwrap().contains(&kopie));
        entfernen(&repo.0, &kopie).unwrap();
        assert!(!kopie.pfad.exists());
        assert!(!liste(&repo.0).unwrap().contains(&kopie));
    }

    #[test]
    fn uncommittete_dateien_bleiben_erhalten() {
        for zustand in ["untracked", "staged", "modified", "ignored"] {
            let repo = TempRepo::neu();
            let kopie = anlegen(&repo.0, "claude").unwrap();
            let git = |args: &[&str]| {
                let ausgabe = Command::new("git").arg("-C").arg(&kopie.pfad).args(args).output().unwrap();
                assert!(ausgabe.status.success(), "{}", String::from_utf8_lossy(&ausgabe.stderr));
            };
            let datei = kopie.pfad.join("arbeit.txt");
            if zustand == "ignored" {
                fs::write(repo.0.join(".git/info/exclude"), "arbeit.txt\n").unwrap();
            }
            fs::write(&datei, "Meine Arbeit").unwrap();
            if zustand == "staged" || zustand == "modified" {
                git(&["add", "arbeit.txt"]);
            }
            if zustand == "modified" {
                git(&["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "Arbeit"]);
                fs::write(&datei, "Neue Arbeit").unwrap();
            }
            let vorher = fs::read(&datei).unwrap();
            let fehler = entfernen(&repo.0, &kopie).unwrap_err();
            assert!(fehler.to_string().contains("Uncommittete"), "{fehler}");
            assert_eq!(fs::read(&datei).unwrap(), vorher);
            assert!(liste(&repo.0).unwrap().contains(&kopie));
        }
    }

    #[test]
    fn unsichere_namen_werden_abgelehnt() {
        let repo = TempRepo::neu();
        for name in ["..", "a..b", "a/b", "a\\b", "", "-f", "a:b"] {
            assert_eq!(anlegen(&repo.0, name).unwrap_err().kind(), io::ErrorKind::InvalidInput);
        }
        assert_eq!(liste(&repo.0).unwrap().len(), 1);
    }

    #[test]
    fn eigener_ordner_und_fremdes_repo() {
        let repo = TempRepo::neu();
        let fremd = TempRepo::neu();
        let (kopie, _) = anlegen_in(&repo.0, "agent-2", Path::new("anderer Ordner")).unwrap();
        assert_eq!(kopie.pfad, fs::canonicalize(repo.0.join("anderer Ordner/agent-2")).unwrap());
        assert!(entfernen(&fremd.0, &kopie).is_err());
        assert!(kopie.pfad.exists());
        entfernen(&repo.0, &kopie).unwrap();
    }
}
