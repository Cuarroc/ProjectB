# ProjectB

Ich gebe einem Orchestrator in einer übersichtlichen Oberfläche Aufträge in meinen
eigenen Worten. Er verteilt die Arbeit auf ein Team von Agenten. Ich sehe auf einen
Blick, wer arbeitet und wer auf mich wartet. Fertig ist nur, was bewiesen ist.

ProjectB ist der schlanke Neubau von ProjectA, mit allem, was dort gelernt wurde.

## Was ProjectB ausmacht

1. **Übersicht:** wenige Bereiche, jeder Platz hat Inhalt, Zustand in 3 Sekunden klar.
2. **Denkraum:** Ideen sammeln, ordnen, mit einem Klick zum Auftrag machen.
3. **Grün heißt bewiesen:** Tests, zwei Reviewer aus verschiedenen Modellfamilien (Codex und Claude),
   Screenshot bei Oberflächen. Erst dann „fertig“.
4. **Mein Werkzeug:** anpassbar über kleine lesbare Dateien statt über hundert Schalter.

## Technik

- Windows-Desktop-App mit Tauri 2: Oberfläche in React und TypeScript (Vite), Kern in Rust, Daten in SQLite.
- Agenten laufen ohne Terminal über ihre Kommandozeilen: `claude -p --output-format stream-json` und `codex exec`.
  Jeder Agent bekommt einen eigenen Git-Worktree.
- Agenten laufen auf dem PC. Der Server kommt als zweiter Ort später dazu.
- Es werden die Abos genutzt. Bezahlte API-Schlüssel nur mit Elias' Ja.

## Die fünf Seiten

| Datei | Inhalt |
|---|---|
| `README.md` | Ziel und Technik (diese Seite) |
| `FAHRPLAN.md` | Schritte, Version 0.1, Später-Liste |
| `AGENTS.md` | Regeln für alle Agenten (`CLAUDE.md` verweist nur darauf) |
| `LEHREN.md` | was ProjectA uns beigebracht hat |
| `UEBERNAHME.md` | was aus ProjectA übernommen wird und was nicht |

Mehr Doku gibt es nicht. Was nicht auf diese Seiten passt, ist nicht wichtig genug.
