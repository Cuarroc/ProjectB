use std::process::Command;

#[test]
fn pruefer_check_offline() {
    // Unter Windows das Git-Bash neben git.exe verwenden, nicht den WSL-Launcher im PATH.
    let bash = if cfg!(windows) {
        let git = Command::new("where.exe").arg("git.exe").output().expect("git.exe suchen");
        let path = String::from_utf8(git.stdout).unwrap();
        std::path::Path::new(path.lines().next().expect("Git im PATH"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("bin/bash.exe")
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
