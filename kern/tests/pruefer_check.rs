use std::path::{Path, PathBuf};
use std::process::Command;

fn bash_bei_git(git: &Path) -> Option<PathBuf> {
    git.ancestors().skip(1).map(|root| root.join("bin/bash.exe")).find(|bash| bash.is_file())
}

#[test]
fn bash_suche_fuer_git_verzeichnisse() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("target/bash-suche-{}", std::process::id()));
    let bash = root.join("bin/bash.exe");
    std::fs::create_dir_all(bash.parent().unwrap()).unwrap();
    std::fs::write(&bash, []).unwrap();
    for git in ["cmd/git.exe", "bin/git.exe", "mingw64/bin/git.exe"] {
        assert_eq!(bash_bei_git(&root.join(git)), Some(bash.clone()), "{git}");
    }
    std::fs::remove_dir_all(&root).unwrap();
    assert_eq!(bash_bei_git(&root.join("cmd/git.exe")), None);
}

#[test]
fn pruefer_check_offline() {
    // Unter Windows das Git-Bash neben git.exe verwenden, nicht den WSL-Launcher im PATH.
    let bash = if cfg!(windows) {
        let git = Command::new("where.exe").arg("git.exe").output().expect("git.exe suchen");
        let path = String::from_utf8(git.stdout).unwrap();
        assert!(git.status.success(), "git.exe nicht gefunden");
        bash_bei_git(Path::new(path.lines().next().expect("Git im PATH")))
            .expect("Git-Bash (bin/bash.exe) in keinem Elternordner von git.exe gefunden")
    } else {
        "bash".into()
    };
    let result = Command::new(bash)
        .arg("../werkzeuge/pruefer-check-test.sh")
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Bash-Tests starten");
    assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
    assert!(String::from_utf8_lossy(&result.stdout).contains("Offline-Tests erfolgreich"));
}
