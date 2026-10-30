# Was ProjectA uns beigebracht hat

Jede Zeile ist eine Lehre aus einem echten Fehler. Quelle: Bestandsaufnahme 30.10.2026 und `docs/development/WORKFLOW.md` in ProjectA.

## Produkt

- **Eine Funktion ist erst echt, wenn Elias sie benutzt.** Die App ProjectA blieb seit dem 05.10. ungenutzt, obwohl jeden Tag gebaut wurde.
- **Agenten ohne Terminal steuern** (JSON-Ereignisse). Das Terminal-Auslesen kostete 8 Fix-PRs und 4.000 Zeilen Workarounds.
- **Den Zustand daraus ableiten, was die Arbeit hinterlässt** (Commits, Exit-Code, PR), nicht aus Meldungen eines Agenten.
- **Der App-Start startet nie selbst Agenten.** In ProjectA zog die Warteschlange beim Start sofort echte Aufträge.
- **Updater und Ausbau des Designsystems erst, wenn es Nutzung gibt.** Der Updater allein kostete 36 PRs.
- **Erst ein festes, sichtbares Designziel, dann bauen.** Das Design-Gate scheiterte viermal und wurde trotzdem gemergt.

## Technik (Windows)

- **Eine einzige Schreibverbindung zur SQLite-Datenbank.** Sonst kommt „database is locked“. Rechteprüfung und Schreiben in derselben Transaktion.
- **Jeden Kindprozess über eine Stelle starten.** Sonst blitzen Konsolenfenster auf. Den Prozessbaum über ein Job-Objekt beenden.
- **Ab Tag 1 `.gitattributes`** für Zeilenenden und klare Pfadregeln. Groß-/Kleinschreibung und CRLF haben CI-Hotfixes gekostet.
- **Git immer mit `git -C <pfad>`.** Nie `git stash` über Worktrees hinweg.
- **Cargo:** Builds mit `CARGO_BUILD_JOBS` begrenzen. Nie `CARGO_PROFILE_*` setzen.
- **Remote-Endpunkte ohne eigene Zugangsdaten prüfen.** Der Updater war mit Token „grün“ und anonym kaputt.

## Agenten und Prüfungen

- **Reviewer:** Codex und Claude finden echte Fehler. Kostenlose Modelle sind Rauschen (Nemotron: 4 von 255 Funden angenommen).
- **Eine Prüfung muss scheitern können.** „Antworte mit BEREIT“ bestand auch bei einem toten Dienst, weil der Agent den Prompt zurückspiegelte.
- **Den ersten Fehlschlag untersuchen,** nicht blind wiederholen. Ein Fehler mit eigenem Code ist eine Information.
- **Nach einem Fix dieselbe Stelle nebenan prüfen.** Der gleiche Fehler wurde direkt daneben neu eingebaut.
- **Nicht öfter nachsehen, als sich etwas ändert.** Abfragen alle 60 Sekunden bei 20 Minuten Arbeit kosteten 223.711 Tokens.
- **Ein Prinzip formulieren statt Einzelfälle aufzählen.** Eine Aufzählung lädt dazu ein, die Lücke zu suchen.
- **Codex** kann Bilder ansehen. **OpenCode** verweigert jeden Pfad außerhalb seines Arbeitsordners.

## Prozess

- **Doku wuchs fast auf Codegröße.** Tests, die Doku-Sätze prüften, machten Aufräumen unmöglich.
- **Jeder Fehler wurde zu einer neuen Regel, gelöscht wurde nie.** Deshalb haben Regeln jetzt ein Budget.
- **Viele Rollen** (Root, Alfred, Stabschef, PM, Projektassistent) schrieben vor allem Text füreinander: 328 Blockaden, kein messbarer Gewinn.
- **Ein Plan mit ständigen Nachträgen ist kein Plan.** Deshalb wird er je Schritt eingefroren.
- **Ohne Releases keine Rückmeldung.** Lieber oft kleine Versionen.
