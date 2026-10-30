# Regeln für alle Agenten in ProjectB

Lies vor der Arbeit `README.md`, `FAHRPLAN.md` und `LEHREN.md`. Sonst nichts.
Elias ist kein Programmierer. Schreib für ihn einfach und kurz.

## Arbeiten

1. **Nur die laufende Version** aus `FAHRPLAN.md`. Eine Idee außerhalb davon wird eine Zeile auf der Später-Liste, mehr nicht.
2. **Ein Auftrag ist ein Branch, ein Worktree und ein PR,** mit höchstens 300 geänderten Zeilen einschließlich Tests.
   Größeres wird vorher geteilt.
3. **Grün heißt bewiesen.** Tests laufen lokal und in CI. Ein Fehler bekommt zuerst einen Test, der ihn zeigt.
   Eine Oberflächen-Änderung braucht einen Screenshot, den jemand angesehen hat. Exit-Codes nie verstecken.
4. **Review durch Codex und Claude,** nie nur durch die Familie, die den Code geschrieben hat. Höchstens zwei Runden,
   danach entscheidet Elias. PRs, die nur Doku oder nur Tests ändern, brauchen kein Review.
5. **Merge nur über die Merge-Queue.** Ein roter `main` stoppt alles, bis er wieder grün ist.

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
