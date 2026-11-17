fn pr_url_erlaubt(url: &str) -> bool {
    let Some(pfad) = url.strip_prefix("https://github.com/") else {
        return false;
    };
    let teile: Vec<_> = pfad.split('/').collect();
    teile.len() == 4
        && !teile[0].is_empty()
        && teile[0]
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
        && !["", ".", ".."].contains(&teile[1])
        && teile[1]
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
        && teile[2] == "pull"
        && !teile[3].is_empty()
        && teile[3].bytes().all(|c| c.is_ascii_digit())
}

#[tauri::command]
pub async fn pr_oeffnen(url: String) -> Result<(), String> {
    if !pr_url_erlaubt(&url) {
        return Err("Ungültiger GitHub-PR-Link".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut befehl = std::process::Command::new(if cfg!(windows) {
            std::path::PathBuf::from(
                std::env::var_os("SystemRoot").unwrap_or_else(|| r"C:\Windows".into()),
            )
            .join("explorer.exe")
        } else {
            std::path::PathBuf::from("xdg-open")
        });
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            befehl.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        pr_starten(befehl.arg(url), cfg!(windows))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn pr_starten(befehl: &mut std::process::Command, nur_starten: bool) -> Result<(), String> {
    if nur_starten {
        // Explorer meldet auch bei erfolgreich geöffnetem Browser häufig Exit-Code 1.
        return befehl
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("PR öffnen: {e}"));
    }
    let status = befehl.status().map_err(|e| format!("PR öffnen: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("PR öffnen fehlgeschlagen: {status}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explorer_status_ignorieren_startfehler_und_linux_status_behalten() {
        use std::process::Command;
        for nur_starten in [true, false] {
            let mut befehl = Command::new(if cfg!(windows) { "cmd.exe" } else { "sh" });
            befehl.args(if cfg!(windows) {
                ["/C", "exit 1"]
            } else {
                ["-c", "exit 1"]
            });
            assert_eq!(pr_starten(&mut befehl, nur_starten).is_ok(), nur_starten);
            assert!(
                pr_starten(&mut Command::new("projectb-fehlender-browser"), nur_starten).is_err()
            );
        }
    }

    #[test]
    fn erlaubt_nur_github_pr_urls() {
        for url in [
            "https://github.com/Cuarroc/ProjectB/pull/250",
            "https://github.com/owner-2/repo_name.rs/pull/12",
        ] {
            assert!(pr_url_erlaubt(url), "{url}");
        }
        for url in [
            "javascript:alert(1)",
            "http://github.com/a/b/pull/1",
            "https://example.com/a/b/pull/1",
            "https://github.com@evil.com/a/b/pull/1",
            "https://github.com/a/b/pull/1x",
            "https://github.com/a/b/pull/1&calc",
            "https://github.com/a/b/pull/1\"",
            "https://github.com/a/b/pull/1'",
            "https://github.com/a/b/pull/1^calc",
            "https://github.com/a/b/pull/1|calc",
            "https://github.com/a/b/pull/%31",
            "https://github.com/a/b/pull/1?x=2",
            "https://github.com/a/b/pull/1#x",
            "https://github.com/a/b/pull/1 ",
            "https://github.com/a/b/pull/1\n",
            "https://github.com/a/b/pull/1/",
            "https://github.com//b/pull/1",
            "https://github.com/a/../pull/1",
            "https://github.com/a/b/pull/",
            "https://github.com/a/b/pull/１",
        ] {
            assert!(!pr_url_erlaubt(url), "{url}");
        }
    }
}
