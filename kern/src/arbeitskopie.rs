use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Arbeitskopie {
    pub pfad: PathBuf,
    pub branch: Option<String>,
}

/// Legt eine Arbeitskopie von HEAD unter `<repo>/.worktrees/<name>` an.
pub fn anlegen(repo: &Path, name: &str) -> io::Result<Arbeitskopie> {
    anlegen_in(repo, name, Path::new(".worktrees"))
}

/// Relative Zielordner beziehen sich auf `repo`; der Agentenname wird angehängt.
pub fn anlegen_in(repo: &Path, name: &str, ordner: &Path) -> io::Result<Arbeitskopie> {
    if name.is_empty() || name.contains("..") || name.contains(['/', '\\']) || name.starts_with('-') {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Ungültiger Name der Arbeitskopie"));
    }
    let branch = format!("agent/{name}");
    ausfuehren(git(repo).args(["check-ref-format", &format!("refs/heads/{branch}")]))
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "Ungültiger Branchname"))?;
    let pfad = std::fs::canonicalize(repo)?.join(ordner).join(name);
    ausfuehren(git(repo).args(["worktree", "add", "-b", &branch]).arg(git_pfad(&pfad)).arg("HEAD"))?;
    Ok(Arbeitskopie { pfad: std::fs::canonicalize(pfad)?, branch: Some(branch) })
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
            repo.git(&[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "--allow-empty",
                "-m",
                "Start",
            ]);
            repo
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
        let kopie = anlegen_in(&repo.0, "agent-2", Path::new("anderer Ordner")).unwrap();
        assert_eq!(kopie.pfad, fs::canonicalize(repo.0.join("anderer Ordner/agent-2")).unwrap());
        assert!(entfernen(&fremd.0, &kopie).is_err());
        assert!(kopie.pfad.exists());
        entfernen(&repo.0, &kopie).unwrap();
    }
}
