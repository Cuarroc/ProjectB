# ProjectB – Was aus ProjectA übernommen wird

Grundlage: Bestandsaufnahme von Root (30.10.2026) und Code von ProjectA (main `227e10db`).

## Die wichtigste Erkenntnis

Die App ProjectA wurde seit dem 05.10. nicht mehr benutzt. Funktioniert hat dagegen die
**Server-Pipeline**: Agenten ohne Terminal starten (`run-job.sh`), PR, zwei Reviewer,
Merge-Queue, CI. Das waren 2.375 Aufträge und 1.060 gemergte PRs ohne einen einzigen Revert.
Diese Pipeline ist der erprobte Motor für ProjectB. Der App-Code ist dagegen größtenteils
um das Terminal-Auslesen (PTY) herum gebaut und wird nicht gebraucht.

## Übernehmen (Code, angepasst)

| Was | Woher | Wofür in ProjectB |
|---|---|---|
| Agenten ohne Terminal starten | Server `~/pa-orch/run-job.sh` (Z. 90–117) | Kern: `claude -p --output-format stream-json`, `codex exec` |
| Eigener Worktree je Agent | `src-tauri/src/worktree.rs` (889 Z.) | Kern |
| Änderungen anzeigen | `diff.rs` (1.361 Z.) | Ergebnis prüfen |
| Tests im Worktree | `testgate.rs` (Idee, 0 Fixes) | „Grün heißt bewiesen“ |
| Kindprozesse unter Windows | `proc.rs` (noch prüfen) | kein Aufblitzen von Konsolenfenstern |
| Geheimnisse schwärzen | `redact.rs` (noch prüfen) | Protokolle |
| Design-Tokens | `src/design/tokens.css` | Startpunkt für das neue Designsystem |
| Repo-Grundlagen | `.gitattributes`, `.gitleaks.toml` | ab Tag 1 (CRLF und Groß-/Kleinschreibung) |

## Neu und klein (Idee aus ProjectA, Code neu)

- **Speicher:** SQLite mit genau einer Schreibverbindung.
- **Agenten:** Status direkt aus den JSON-Ereignissen der Agenten statt aus dem Terminal.
- **Anbieter:** nur Claude und Codex.
- **Oberfläche:** Bildschirme und Bausteine neu.
- **Denkraum:** neu, sobald entschieden ist, wann er kommt.

## Übernehmen (Wissen, kein Code)

- **Reviewer:** nur Codex und Claude. Kostenlose Modelle sind Rauschen (Nemotron: 4 von 255 Funden angenommen).
- **Diese Prüfungen haben echte Fehler gefunden und bleiben:** zwei Reviewer, Merge-Queue mit Stopp bei rotem main,
  Größengrenze pro PR, Secret-Scan.
- **Sonstiges:** Lehren und Windows-Fallen. Sie kommen in `LEHREN.md` (Schritt 2).

## Weglassen

- Terminal-Auslesen: `pty`, `submit_guard`, `stuck`, `process_capture` (zusammen etwa 18.000 Zeilen)
- `pa`-CLI, Steuer-API, `web_interface`, Dev-HQ
- Updater und `delivery_recovery`, bis es Nutzer gibt
- Dauerlauf (`development_*`, `readiness`, `core_register`)
- Nebenfunktionen: `omniroute`, `freetier`, `ruflo`, `scout`, `critic`, `roles`, `learnings`, `enhance`, `digest`
- Prozess-Regeln: Nahtstellen-Regel, Hooks `rules-guard` und `seam-guard`, Red-First als CI-Job (als Gewohnheit bleibt es), Plan- und Spec-Skripte
- Doku-Ordner: `docs/`, `.pa/`
- Die Rollen Alfred, Stabschef, PM und Projektassistent. Es bleibt ein Orchestrator.

## Entschieden (Elias, 30.10.2026)

1. **Denkraum:** Er wurde in ProjectA gebaut, aber nie benutzt. In ProjectB wird er neu und klein gebaut, als Kandidat für 0.2.
2. **Agenten** laufen heute auf dem PC und auf dem Server (Server etwa 83 €/Monat). ProjectB fängt auf dem PC an,
   der Server kommt später als zweiter Ort.
3. **Bezahlte API-Schlüssel** nur mit Elias' Ja, wie in ProjectA.
