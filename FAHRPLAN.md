# ProjectB – Fahrplan

Stand: 05.11.2026 · Aktueller Schritt: **4b** · Version 0.1 eingefroren (Elias, 30.10.2026) · Ziel: siehe `README.md`

## Schritte

| # | Schritt | Wer | Fertig, wenn … |
|---|---|---|---|
| 0 | ProjectA einfrieren | Elias | keine neuen Pläne oder Pakete, automatische Starter aus (Elias prüft Roots Antwort) ✅ |
| 1 | Bestand von ProjectA prüfen | Elias + Claude | `UEBERNAHME.md` steht ✅ |
| 2 | Version 0.1 festlegen, Repo anlegen | Elias + Claude | Version 0.1 unten von Elias abgenommen; Repo mit den fünf Seiten ✅ |
| 3 | Technik-Probe | Claude oder AgentsRoom | ProjectB startet Claude und Codex ohne Terminal, zeigt den Fortschritt live und hält sie an; ein weiterer Anbieter ist nur ein kleiner Zusatz ✅ |
| 4a | Designsystem und Hauptbildschirme | Elias + Claude | Designsystem in Claude; Bildschirme von 0.1 als Entwurf, von Elias abgenommen ✅ |
| 4b | Oberfläche bauen | AgentsRoom | nur Bildschirme von 0.1, mit Beispieldaten über eine feste Datenschnittstelle; startet unter Windows |
| 5 | Funktionen anschließen | AgentsRoom | je Funktion: Beispieldaten durch echte ersetzt, Elias hat es selbst geprüft |
| 6 | Umzug | Elias | ProjectB wird mit ProjectB weitergebaut |

## Version 0.1 (höchstens 5 Funktionen)

1. **Projekt wählen:** einen lokalen Ordner mit Git-Repo öffnen.
2. **Mit dem Orchestrator chatten:** Aufträge in deinen Worten, in einem Chat mit Verlauf und einer Liste der Chats. Modus Ausführen, Planen oder Interview: Im Interview fragt der Orchestrator erst nach, bis die Richtung klar ist. Im Verlauf stehen seine Aktionen, sein Plan und seine Fragen an dich. Einen Auftrag teilt er in höchstens 3 Teilaufgaben.
   Daneben stehen seine Todo-Liste mit einem Feld zum Hinzufügen und der Postfach-Knopf.
3. **Team arbeitet:** höchstens 3 Agenten parallel (Claude Code oder Codex), jeder in einem eigenen Worktree.
   Eine Liste zeigt „arbeitet“, „wartet auf dich“, „fertig“ und „Problem“, live. Jeder Agent lässt sich anhalten.
   Eine Liste zeigt die Dateien, die eine Sitzung erzeugt hat (zum Beispiel `export.csv`, eine Bildschirm-Aufnahme, der PR-Bericht), jede mit „Ansehen“.
4. **Grün heißt bewiesen:** Tests im Worktree, PR, Review durch Codex und Claude.
   Erst danach steht „fertig“ da, mit Beleg und Link zum PR.
5. **Rollen und Kontingent:** Anbieter, Modell und Effort für Orchestrator, Worker und Reviewer, im Chat schnell umschaltbar. Effort heißt Niedrig, Mittel, Hoch oder Sehr hoch. Der Verbrauch von Claude und Codex ist immer sichtbar.

Die Bereiche links und rechts auf dem Hauptbildschirm lassen sich einklappen.

0.1 ist fertig, wenn Elias damit drei echte Aufträge von Anfang bis Ende erledigt hat, ohne selbst in den Code
einzugreifen, und dabei jede der fünf Funktionen oben mindestens einmal funktioniert hat. Was dabei hakt, wird
behoben, bevor 0.2 beginnt.

## Spielregeln für diesen Plan

- **Eingefroren.** Geändert wird nur zwischen zwei Schritten, nie mittendrin, und nur von Elias.
- **Neue Ideen** kommen auf die Später-Liste, nicht in den Plan.
- **Details** zu einem Schritt werden erst zu seinem Beginn geplant, höchstens eine Seite.
- **Diese Datei bleibt eine Seite.**
- **Fertig** heißt: Elias hat es gesehen und benutzt, nicht: ein Agent hat es gemeldet.

## Später-Liste (Reihenfolge entscheidet Elias nach 0.1)

- Denkraum: Ideen sammeln, ordnen, zum Auftrag machen (Kandidat für 0.2)
- Server als zweiter Ort für Agenten
- Statistik: Zeit, Tokens, Erfolgsquote je Modell
- Weitere Anbieter mit Abo: OpenCode, Kimi, Ollama (erste Kandidaten für 0.2)
- Anpassung über Dateien: Teams, Rollen, Prüfstufen
- Updater
- Chat-Werkzeuge: Befehle mit /, Verweise mit @, Anhänge, /kompakt (aus Schritt 4a, 04.11.2026)
- Ziel 0.2 (Elias, 05.11.2026): Vorschau dessen, was ein Agent baut, aus seiner Arbeitskopie; Kommentare an eine Stelle der Vorschau, die direkt an diesen Agenten gehen (der Orchestrator liest mit); direkter Chat mit einem einzelnen Agenten
- Ziel 0.2 (Elias, 05.11.2026): Ziel setzen, Nachtmodus, Prompt bauen, Ansicht der Subagenten
