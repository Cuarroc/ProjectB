# ProjectB – Fahrplan

Stand: 05.11.2026 · Aktueller Schritt: **4b** · Version 0.1 eingefroren (Elias, 30.10.2026) · Ziel: siehe `README.md`

## Schritte

| # | Schritt | Wer | Fertig, wenn … |
|---|---|---|---|
| 0–3 | ProjectA einfrieren, Bestand prüfen, 0.1 festlegen, Technik-Probe | Elias + Claude | ✅ |
| 4a | Designsystem und Hauptbildschirme | Elias + Claude | Entwürfe von Elias abgenommen ✅ |
| 4b | Oberfläche bauen | AgentsRoom | nur Bildschirme von 0.1, Beispieldaten über eine feste Datenschnittstelle; startet unter Windows |
| 5 | Funktionen anschließen | AgentsRoom | je Funktion: echte Daten statt Beispieldaten, von Elias selbst geprüft |
| 6 | Umzug | Elias | ProjectB wird mit ProjectB weitergebaut |

## Version 0.1 (höchstens 5 Funktionen)

1. **Projekt wählen:** einen lokalen Ordner mit Git-Repo öffnen.
2. **Mit dem Orchestrator chatten:** Aufträge in deinen Worten, Chat mit Verlauf und Liste der Chats. Modi:
   Ausführen, Planen, Interview. Im Interview fragt er einzeln (Knöpfe und freies Feld), bis er sicher ist, fasst
   zusammen, du bestätigst. Im Planen markierst du Schritte und kommentierst sie, „Ausarbeiten“ zerlegt einen
   Schritt, Stil-Knöpfe ändern die Fassung, jeder Schritt hat Abnahme-Kriterien; am Ende „Freigeben und bauen“
   oder „Mit Kommentaren zurückgeben“. Höchstens 3 Teilaufgaben je Auftrag. Daneben seine Todo-Liste und das
   Postfach mit Zahl am Knopf für alles, was auf dich wartet; dringende Fragen auch im Chat. Ist ProjectB nicht
   vorne: Windows-Benachrichtigung, bei Fragen mit leisem Ton.
3. **Team arbeitet:** höchstens 3 Agenten parallel (Claude Code oder Codex), jeder in eigenem Worktree. Live:
   „Arbeitet“, „Wartet auf dich“, „Fertig“, „Problem“. Jeder Agent lässt sich anhalten; „Alles anhalten“ sichert
   den Stand mit einem WIP-Commit und stoppt in etwa 30 Sekunden. Liste der Dateien einer Sitzung mit „Ansehen“.
4. **Grün heißt bewiesen:** Tests im Worktree, PR, Review durch die andere Modellfamilie. Erst dann „Fertig“, mit
   Beleg und Link zum PR.
5. **Rollen, Kontingent, Berechtigungen:** Anbieter, Modell und Effort (Niedrig bis Sehr hoch) für Orchestrator,
   Worker und Reviewer, im Chat umschaltbar; Standard Orchestrator Opus 5.5, Hoch, 1M Kontext. Verbrauch von
   Claude und Codex immer sichtbar. Knopf „Berechtigungen“: Vorsichtig, Nur bei Wichtigem (Standard), Autonom;
   AGENTS.md Regeln 5–7 gelten in jeder Stufe.

Die Bereiche links und rechts lassen sich einklappen. 0.1 ist fertig, wenn Elias damit drei echte Aufträge von
Anfang bis Ende erledigt hat, ohne in den Code einzugreifen, und jede Funktion mindestens einmal lief. Was hakt,
wird vor 0.2 behoben.

## Spielregeln

- **Eingefroren:** geändert nur zwischen zwei Schritten und nur von Elias. Neue Ideen auf die Später-Liste.
- **Details** zu einem Schritt erst zu seinem Beginn, höchstens eine Seite. Diese Datei bleibt eine Seite.
- **Fertig** heißt: Elias hat es gesehen und benutzt, nicht: ein Agent hat es gemeldet.

## Später-Liste (Reihenfolge entscheidet Elias nach 0.1)

- Denkraum (Kandidat für 0.2); Server als zweiter Ort; Statistik je Modell; Updater
- Weitere Anbieter mit Abo: OpenCode, Kimi, Ollama; Anpassung über Dateien (Teams, Rollen, Prüfstufen)
- Chat-Werkzeuge: Befehle mit /, Verweise mit @, Anhänge, /kompakt
- Ziel 0.2: Modus „Prompt bauen“, Ziel setzen, Nachtmodus, Ansicht der Subagenten, direkter Chat mit einem Agenten
- Ziel 0.2: im Plan Aufwand und Risiko je Schritt, zwei Fassungen zum Vergleich
- Ziel 0.2: Berechtigung „Maximal“ und Zeitlimit („4 Stunden“, „Bis morgen 8 Uhr“)
- Vorschau und Kommentare an die Vorschau: über AgentsRoom gelöst (05.11.2026)
- Leitstand-Prüfer-Benchmark: die zwei P3 aus Leitstand-PR #7 (Blindheit nur per Anweisung, Zusatzfunde in Fehler-Fällen)
