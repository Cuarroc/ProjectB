# ProjectB – Was aus ProjectA übernommen wird

Grundlage: Bestandsaufnahme von ProjectA (30.10.2026, main `227e10db`).

**Wichtigste Erkenntnis:** Die App ProjectA wurde seit dem 05.10. nicht mehr benutzt. Funktioniert hat die
**Server-Pipeline**: Agenten ohne Terminal, PR, Review, Merge-Queue, CI. Das waren 2.375 Aufträge und 1.060
gemergte PRs ohne Revert. Sie ist der Motor für ProjectB. Der App-Code hängt am Terminal-Auslesen (PTY) und entfällt.

## Übernehmen

| Was | Woher | Wofür |
|---|---|---|
| Agenten ohne Terminal starten | Server `~/pa-orch/run-job.sh` (Z. 90–117) | Kern: `claude -p --output-format stream-json`, `codex exec` |
| Eigener Worktree je Agent | `src-tauri/src/worktree.rs` | Kern |
| Änderungen anzeigen | `diff.rs` | Ergebnis prüfen |
| Tests im Worktree | `testgate.rs` (Idee) | „Grün heißt bewiesen“ |
| Kindprozesse unter Windows, Geheimnisse schwärzen | `proc.rs`, `redact.rs` (noch prüfen) | keine Konsolenfenster; Protokolle |
| Repo-Grundlage | `.gitattributes` | CRLF und Groß-/Kleinschreibung |

Neu und klein: SQLite mit genau einer Schreibverbindung; Status aus den JSON-Ereignissen der Agenten;
nur Claude und Codex; Bildschirme und Bausteine neu. Wissen und Windows-Fallen stehen in `LEHREN.md`.

## Weglassen

- Terminal-Auslesen: `pty`, `submit_guard`, `stuck`, `process_capture` (etwa 18.000 Zeilen)
- `pa`-CLI, Steuer-API, `web_interface`, Dev-HQ, Updater, `delivery_recovery`, Dauerlauf
- Nebenfunktionen: `omniroute`, `freetier`, `ruflo`, `scout`, `critic`, `roles`, `learnings`, `enhance`, `digest`
- Prozess-Regeln und -Skripte: Nahtstellen-Regel, `rules-guard`, `seam-guard`, Red-First als CI-Job, `docs/`, `.pa/`
- Rollen außer Orchestrator, Aufsicht (Claude), Prüfer Claude und Codex und dem Assistenten für Elias (30.10.2026)

## Entschieden (Elias, 30.10.2026)

1. **Denkraum** wird neu und klein gebaut, Kandidat für 0.2.
2. **Agenten** laufen im Produkt zuerst auf dem PC; der Server (etwa 83 €/Monat) kommt später als zweiter Ort dazu.

## Dauerfreigaben

| Nr. | Freigabe | Grenze |
|---|---|---|
| 1 | Werkzeug-Updates auf PC und Server | Nur installierte Werkzeuge aus offizieller Quelle |
| 2 | Aufräumen nach Merge | Nur ProjectB, nie main, nichts Ungesichertes, nichts aus ProjectA |
| 3 | AgentsRoom für ProjectB einrichten | Nie kostenpflichtig; Webhooks und Tresor bleiben bei Elias |
| 4 | Server-Betrieb für ProjectB | Kein Server-Neustart, keine Admin-Rechte |
| 5 | Alte ProjectA-Quota-Regeln aus | Einmalig, erledigt |
| 6 | Weitergabe durch die Aufsicht | Elias' Entscheidungen über das Postfach gelten wie direkt gesagt; nicht für Geld, Rechte, Löschen außerhalb, neue Programme, Releases |
| 7 | Dependabot ohne `elias-ok` (30.10.2026) | Nur Dependabot; Major-Sprünge hält Prüfer Claude mit P2 auf |
| 8 | Prüfer-Checks `review/claude` und `review/codex` | Nur über `werkzeuge/pruefer-check.sh` aus dem main-Checkout |
| 9 | CodeQL und Copilot-Review laufen mit | Keine Pflicht für den Merge |
