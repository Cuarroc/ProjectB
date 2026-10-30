# Regeln für alle Agenten in ProjectB

Arbeiter lesen vor der Arbeit `AGENTS.md`, ihren Auftrag und „Technik (Windows)“ in `LEHREN.md`. `README.md` und `FAHRPLAN.md` liest nur der Orchestrator.
Elias ist kein Programmierer. Schreib für ihn einfach und kurz.

## Arbeiten

1. **Nur die laufende Version** aus `FAHRPLAN.md`. Eine Idee außerhalb davon wird eine Zeile auf der Später-Liste, mehr nicht.
2. **Ein Auftrag ist ein Branch, ein Worktree und ein PR,** mit höchstens 300 geänderten Zeilen einschließlich Tests.
   Automatisch erzeugte Dateien wie `Cargo.lock` zählen nicht mit. Größeres wird vorher geteilt.
3. **Grün heißt bewiesen.** Tests laufen lokal und in CI. Ein Fehler bekommt zuerst einen Test, der ihn zeigt.
   Eine Oberflächen-Änderung braucht einen Screenshot, den jemand angesehen hat. Exit-Codes nie verstecken.
4. **Review durch die ANDERE Modellfamilie** auf dem aktuellen Stand (eins reicht). Oberflächen-PRs prüft zusätzlich
   ein Claude-Agent am Screenshot. Höchstens zwei Runden mit offenen Funden, dann Label `stopp` und Frage an Elias.
   Im PR-Text steht „Geschrieben von: Claude|Codex“, dazu das Label `autor-claude` oder `autor-codex`.
5. **Merge automatisch über Mergify,** wenn CI grün und Review ok. Änderungen an `.github/` und `.mergify.yml` nur mit
   Elias' Ja (Label `elias-ok`). Ein roter `main` stoppt alles, der Orchestrator repariert ihn sofort.

## Sicherheit

6. **Keine Geheimnisse** in Dateien, Logs oder Commits. Secret-Scan vor jedem Commit.
7. **Nur mit Elias' ausdrücklichem Ja:** Geld und bezahlte API-Schlüssel, Installationen außerhalb des Projekts,
   Releases und Tags, Rechte-Änderungen, Löschen außerhalb des eigenen Worktrees.

## Gegen Ballast

8. **Fünf Seiten, mehr nicht:** `README`, `FAHRPLAN`, `AGENTS`, `LEHREN`, `UEBERNAHME`, jede höchstens eine Seite.
   Ohne Elias' Auftrag gibt es keine neuen Dokumente, Rollen, Gates, Hooks oder Prozess-Skripte.
   Eine neue Regel kommt nur dazu, wenn eine alte dafür geht. Ein Gate, das in 30 Tagen keinen echten Fehler gefunden hat, wird gestrichen.
9. **Keine Tests oder Skripte, die Doku-Text prüfen.**
10. **Der Bericht an Elias** hat höchstens 6 Zeilen: Was geht jetzt? Wie sehe ich es? Was ist offen?
    Der technische Bericht steht im PR-Text. Es gibt keine Berichtsdateien.
11. **Design:** nur Tokens aus `src/design/tokens.css`. Schrift mindestens 12 px.
    Jeder Bereich ist so groß wie sein Inhalt.
