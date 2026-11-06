import type { Datenstand, Planschritt } from "./typen";

export const modusEinstellungen = {
  Ausführen: [
    { name: "Agenten gleichzeitig", empfohlen: "Bis zu 3", werte: ["1", "Bis zu 3", "Bis zu 5"] },
    { name: "Prüfung durch", empfohlen: "Andere Modellfamilie", werte: ["Andere Modellfamilie", "Gleiche Familie"] },
    { name: "Prüfrunden höchstens", empfohlen: "3", werte: ["1", "2", "3"] },
  ],
  Planen: [
    { name: "Plan", empfohlen: "Normal", werte: ["Kurz", "Normal", "Ausführlich"] },
    { name: "Dauer und Tokens schätzen", empfohlen: "An", werte: ["An", "Aus"] },
    { name: "Bei Unklarem nachfragen", empfohlen: "An", werte: ["An", "Aus"] },
  ],
} as const;

export const orchestratorBeispiel = { tokens: 113000, laufzeitSekunden: 432,
  phasen: [{ art: "lesen", name: "Lesen", start: 0, ende: 40 },
    { art: "lesen", name: "Planen", start: 40, ende: 70 },
    { art: "koordiniert", name: "Koordiniert", start: 70, ende: 432 }] } as const;
export const teamTestverlauf = [{ zeit: "14:31", gruen: 0 }, { zeit: "14:32", gruen: 6 },
  { zeit: "14:33", gruen: 10 }, { zeit: "14:34", gruen: 12 },
  { zeit: "14:35", gruen: 9, rot: 3 }, { zeit: "14:36", gruen: 21 }, { zeit: "14:37", gruen: 26 }];

const schritt = (id: string, titel: string, agentId: string | null,
  zustand: Planschritt["zustand"], beschreibung: string): Planschritt => ({
  id, titel, agentId, zustand, beschreibung, dauerMinuten: 5, kommentar: "", markierungen: [],
  fertigWenn: [{ text: "Tests grün und Review durch die andere Modellfamilie", erfuellt: zustand === "Fertig" }],
});

export const beispiel: Datenstand = {
  aktiverChatId: "csv-export", chats: [{
    id: "csv-export", titel: "Paketliste als CSV exportieren", modus: "Ausführen",
    modell: "Opus 5.5", effort: "Hoch", kontextfenster: 1000000, kontextProzent: 10, gestartetUm: "14:30",
    verlauf: [
      { id: "auftrag", von: "Du", zeit: "14:30", aktionen: [],
        text: "Exportiere die Paketliste als CSV, mit Spalten für Status und Dauer." },
      { id: "plan", von: "Orchestrator", zeit: "14:31", planId: "csv-plan", aktionen: [],
        text: "Ich teile das in 3 Teilaufgaben, jede in einer eigenen Arbeitskopie des Projekts. Fertig ist eine erst mit grünen Tests und Review durch die andere Modellfamilie." },
      { id: "frage", von: "Orchestrator", zeit: "14:36", frageId: "speicherort", aktionen: [],
        text: "Frage von Knopf „Als CSV speichern“" },
    ],
  }],
  agenten: [
    { id: "dauer", name: "Spalte „Dauer“ berechnen", anbieter: "Codex", modell: "gpt-6.1-sol",
      effort: "Hoch", zustand: "Fertig", fortschritt: 100, arbeitskopie: "csv-dauer",
      liveZeile: "Tests grün", tokens: 52000, laufzeitSekunden: 350,
      phasen: [{ name: "Lesen", start: "14:30:00", ende: "14:30:25" },
        { name: "Bauen", start: "14:30:25", ende: "14:32:40" },
        { name: "Testen", start: "14:32:40", ende: "14:34:20" },
        { name: "Review", start: "14:34:20", ende: "14:35:50" }],
      dateien: [], letzteZeilen: [], tests: { gruenSeit: "14:33", gruen: 12, gesamt: 12, verlauf: [] }, schaetzung: null },
    { id: "kern", name: "CSV-Export im Kern", anbieter: "Codex", modell: "gpt-6.1-sol",
      effort: "Hoch", zustand: "Arbeitet", fortschritt: 67, arbeitskopie: "csv-export",
      liveZeile: "cargo test export · 14 von 21 grün", tokens: 132000, laufzeitSekunden: 372,
      dateien: [{ pfad: "src/export.rs", hinzugefuegt: 84, entfernt: 3 },
        { pfad: "tests/export.rs", hinzugefuegt: 41, entfernt: 0 }, { pfad: "Cargo.toml", hinzugefuegt: 1, entfernt: 0 }],
      letzteZeilen: ["test export::csv_kopfzeile … ok", "test export::csv_leer … ok", "test export::csv_umlaute … ok"],
      tests: { gruenSeit: "14:34", gruen: 14, gesamt: 21,
        verlauf: [{ zeit: "14:34", rot: 0 }, { zeit: "14:35", rot: 3 }, { zeit: "14:37", rot: 0 }] },
      schaetzung: { fertigUm: "14:39", restMinuten: 2 },
      phasen: [{ name: "Lesen", start: "14:31:00", ende: "14:31:30" },
        { name: "Bauen", start: "14:31:30", ende: "14:34:00" },
        { name: "Testen", start: "14:34:00", ende: null }] },
    { id: "knopf", name: "Knopf „Als CSV speichern“", anbieter: "Claude", modell: "Sonnet 5.5",
      effort: "Hoch", zustand: "Wartet auf dich", fortschritt: 40, arbeitskopie: "csv-knopf",
      liveZeile: "Wartet auf den Speicherort", tokens: 61000, laufzeitSekunden: 287,
      phasen: [{ name: "Lesen", start: "14:31:00", ende: "14:31:30" },
        { name: "Bauen", start: "14:31:30", ende: "14:36:00" }],
      dateien: [], letzteZeilen: [], tests: null, schaetzung: null },
  ],
  plan: { id: "csv-plan", titel: "CSV-Export", freigabe: "Freigegeben", schritte: [
    schritt("lesen", "Paketliste lesen", null, "Fertig", "Die vorhandenen Paketdaten und Zustände erfassen."),
    schritt("dauer", "Spalte „Dauer“ berechnen", "dauer", "Fertig", "Laufende Pakete brauchen eine Dauer bis jetzt."),
    schritt("kern", "CSV-Export im Kern, mit Tests", "kern", "Arbeitet", "Der Kern liefert die Daten, alles andere baut darauf auf."),
    schritt("knopf", "Knopf „Als CSV speichern“", "knopf", "Wartet auf dich", "Der Speicherort ist noch unklar."),
    schritt("review", "Gesamtergebnis prüfen", null, "Offen", "Export und Knopf gemeinsam prüfen."),
  ] },
  fragen: [{ id: "speicherort", agentId: "knopf",
    text: "Wo soll die CSV-Datei standardmäßig gespeichert werden?",
    antwortknoepfe: [{ id: "downloads", text: "In Downloads" }, { id: "projekt", text: "Im Projektordner" }] }],
  todos: [{ id: "export", text: "CSV-Export fertigstellen", fertig: false },
    { id: "speicherort", text: "Speicherort auswählen", fertig: false },
    { id: "pruefen", text: "Gesamtergebnis prüfen", fertig: false }],
  ausgaben: [], belege: [],
  kopf: { projekt: "ProjectB", pfad: "C:\\ProjectB", zweig: "main",
    kontingent: { claude: 42, codex: 51 }, postfach: 3 },
  berechtigungen: {
    aktuell: "Nur bei Wichtigem",
    stufen: [
      { name: "Vorsichtig", beschreibung: "Fragt vor jeder Änderung." },
      { name: "Nur bei Wichtigem", beschreibung: "Arbeitet allein in der Arbeitskopie." },
      { name: "Autonom", beschreibung: "Legt vor, was ein Ja braucht, und arbeitet weiter." },
    ],
    regeln: [
      ...["Dateien in seiner Arbeitskopie ändern", "Tests und Build in der Arbeitskopie ausführen",
        "Agenten und Subagenten starten", "PR öffnen und mergen, wenn Tests grün und Review ohne Funde",
        "Im Internet suchen und Doku lesen"].map(text => ({ text,
        stufen: { Vorsichtig: "Fragt dich", "Nur bei Wichtigem": "Allein", Autonom: "Allein" } as const })),
      ...["Browser steuern, mit deinen Anmeldungen", "Werkzeuge außerhalb des Projekts", "Programme installieren"].map(text => ({ text,
        stufen: { Vorsichtig: "Nie", "Nur bei Wichtigem": "Fragt dich", Autonom: "Legt es dir hin" } as const })),
      ...["Releases und Tags", "Regeln für CI und Merge ändern"].map(text => ({ text,
        stufen: { Vorsichtig: "Fragt dich", "Nur bei Wichtigem": "Fragt dich", Autonom: "Legt es dir hin" } as const })),
    ],
    giltImmer: ["Geld ausgeben oder bezahlte Schlüssel nutzen", "Schlüssel und Passwörter in Dateien, Chat oder Protokoll",
      "Konten anlegen oder Passwörter eingeben", "Außerhalb des Projekts endgültig löschen"],
  },
};
