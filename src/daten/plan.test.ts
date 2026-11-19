import { expect, it } from "vitest";
import { antwortPlan, planKommentare } from "./plan";

const text = "Mein Plan:\n- [ ] Export bauen\n  Vorhandenen Export ergänzen.\n  Fertig, wenn CSV stimmt.\n  - Fertig, wenn Umlaute stimmen.\n- [x] Testen\n  Leere Listen prüfen.\n  Fertig, wenn Tests grün sind.\n- [ ] Prüfen\n  Fertig, wenn Review fertig ist.";
it("erkennt drei Schritte mit Beschreibung, Kriterien und leeren Arbeitsfeldern", () => {
  const plan = antwortPlan(text, "antwort")!;
  expect(plan.id).toBe("antwort"); expect(plan.schritte).toHaveLength(3);
  expect(plan.schritte[0]).toMatchObject({ titel: "Export bauen", beschreibung: "Vorhandenen Export ergänzen.", agentId: null, zustand: "Offen", dauerMinuten: null, tokens: null, risiko: null, kommentar: "", markierungen: [],
    fertigWenn: [{ text: "CSV stimmt.", erfuellt: false }, { text: "Umlaute stimmen.", erfuellt: false }] });
  expect(plan.schritte[1].titel).toBe("Testen"); expect(plan.schritte[2].beschreibung).toBe("");
});
it.each([["~40k", "Niedrig", 1], ["40000", "Mittel", 2], ["40 k", "Hoch", 3]])("liest Aufwand und Risiko ohne Beschreibungstext: %s, %s", (tokens, risiko, stufe) => {
  for (const praefix of ["", "  - "]) {
    const plan = antwortPlan(`- [ ] Export\r\n${praefix}dAuEr: ~6 MIN\r\n${praefix}tOkEnS: ${tokens}\r\n${praefix}rIsIkO: ${risiko.toUpperCase()}\r\n  CSV ergänzen.\r\n- [ ] Prüfen\nDauer: ~3 min\nTokens: ~20k\nRisiko: Niedrig`, "n")!;
    expect(plan.schritte[0]).toMatchObject({ dauerMinuten: 6, tokens: 40000, risiko: stufe, beschreibung: "CSV ergänzen." });
    expect(plan.schritte[1]).toMatchObject({ dauerMinuten: 3, tokens: 20000, risiko: 1, beschreibung: "" });
  }
});
it("lässt fehlende Schätzungen in jedem Schritt unbekannt", () => {
  expect(antwortPlan("- [ ] A\n- [ ] B", "n")!.schritte.map(({ dauerMinuten, tokens, risiko }) => [dauerMinuten, tokens, risiko])).toEqual([[null, null, null], [null, null, null]]);
});
it.each(["~1.5k", "~1,5k", "1.5 k", "1,5 K"])("liest dezimale Token-Schätzungen: %s", tokens => {
  expect(antwortPlan(`- [ ] A\n  Tokens: ${tokens}`, "n")!.schritte[0]).toMatchObject({ tokens: 1500, beschreibung: "" });
});
it.each(["~5–8", "5-8", "~8–5", "5 - 8"])("liest den größeren Wert einer Zeitspanne: %s", dauer => {
  expect(antwortPlan(`- [ ] A\n  Dauer: ${dauer} min`, "n")!.schritte[0]).toMatchObject({ dauerMinuten: 8, beschreibung: "" });
});
it.each(["", "- ", "  ", "  - ", "\t- "])("behält unlesbare Schätzungen außerhalb der Beschreibung: %j", praefix => {
  for (const wert of ["unbekannt", ""]) {
    const angaben = ["dAuEr", "tOkEnS", "rIsIkO"].map(feld => `${praefix}${feld}: ${wert}`).join("\n");
    const plan = antwortPlan(`- [ ] A\n${angaben}\n  A erklärt.\n- [ ] B\n${angaben}\n  B erklärt.`, "n")!;
    expect(plan.schritte).toHaveLength(2);
    expect(plan.schritte.map(({ dauerMinuten, tokens, risiko, beschreibung }) => [dauerMinuten, tokens, risiko, beschreibung]))
      .toEqual([[null, null, null, "A erklärt."], [null, null, null, "B erklärt."]]);
  }
});
it.each(["Kein Plan.", "```md\n- [ ] Beispiel\n```", "~~~md\n- [x] Beispiel\n~~~"])("erzeugt ohne echte Liste keinen Plan: %s", text => {
  expect(antwortPlan(text, "n")).toBeUndefined();
});
it("ignoriert Code und behält nur die letzte Aufgabenliste", () => {
  expect(antwortPlan("- [ ] Alt\nNeuer Plan:\n" + text + "\n```\n- [ ] Beispiel\n```", "n")?.schritte.map(s => s.titel)).toEqual(["Export bauen", "Testen", "Prüfen"]);
});
it("ordnet Text zwischen Punkten zu und lässt die Schlussfrage weg", () => {
  const plan = antwortPlan("- [ ] A\nA erklärt.\nFertig, wenn A läuft.\n- [ ] B\nB erklärt.\n- [ ] C\nGibst du frei?\n```\n- [ ] Beispiel\n```\n  C erklärt.\nFertig, wenn C läuft.", "n")!;
  expect(plan.schritte.map(s => [s.titel, s.beschreibung, s.fertigWenn.map(k => k.text)])).toEqual([
    ["A", "A erklärt.", ["A läuft."]], ["B", "B erklärt.", []], ["C", "C erklärt.", ["C läuft."]],
  ]);
});
it("sendet markierte Teiltexte mit Feld und Kriteriumsnummer", () => {
  const plan = antwortPlan(text, "n")!, s = plan.schritte[0];
  const marken = { [`${s.id}:titel`]: { name: "Simpler", start: 0, ende: 6 }, [`${s.id}:beschreibung`]: { name: "Kommentar", start: 12, ende: 18 },
    [`${s.id}:bedingung1`]: { name: "Ausarbeiten", start: 0, ende: 7 } } as const;
  expect(planKommentare(plan, "Simpler", marken)).toBe("Kommentare zum Plan:\n- Export bauen: [] \n  - „Export“ (Titel): Simpler\n  - „Export“ (Beschreibung): Kommentar\n  - „Umlaute“ (Kriterium 2): Ausarbeiten\nGewünschte Fassung: Simpler");
});
it("baut Kommentare mit Markierungen, Ausarbeiten-Bitte und gewünschter Fassung", () => {
  const plan = antwortPlan(text, "n")!;
  plan.schritte[0].markierungen = ["Ausarbeiten", "Kommentar"]; plan.schritte[0].kommentar = "Auch Umlaute.";
  plan.schritte[1].kommentar = "Bitte genauer.";
  expect(planKommentare(plan, "Simpler")).toBe("Kommentare zum Plan:\n- Export bauen: [Ausarbeiten, Kommentar] Auch Umlaute. Bitte zerlege diesen Schritt in Teilschritte.\n- Testen: [] Bitte genauer.\nGewünschte Fassung: Simpler");
});

it.each(["Neuer Plan:", "# Neuer Plan"])("liest nur die letzte Liste nach %s, auch mit Fließtext", trenner => {
  const plan = antwortPlan(`Stand:\n- [x] Alt\n${trenner}\n- [ ] A\nA erklärt.\n- [ ] B`, "n");
  expect(plan?.schritte.map(s => s.titel)).toEqual(["A", "B"]);
  expect(plan?.schritte[0].beschreibung).toBe("A erklärt.");
});
it("ignoriert Blockzitate samt Überschriften und Codezäunen", () => {
  const plan = antwortPlan("- [ ] A\n> Neuer Plan:\n> - [x] Zitat\n> ```\n- [ ] B", "n");
  expect(plan?.schritte.map(s => s.titel)).toEqual(["A", "B"]);
  expect(plan?.schritte[0].beschreibung).toBe("");
});
it("lässt Rechenzeichen stehen und entfernt nur enges Markdown", () => {
  const plan = antwortPlan("- [ ] 2 * 3 * 4 und **fett**", "n");
  expect(plan?.schritte[0].titel).toBe("2 * 3 * 4 und fett");
});
it("sendet ohne Stilwunsch keine gewünschte Fassung", () => {
  expect(planKommentare(antwortPlan("- [ ] A", "n")!, "")).toBe("Kommentare zum Plan:");
});
it.each(["  Betroffene Dateien:", "\tBetroffene Dateien:", "  ## Betroffene Dateien", "\t## Betroffene Dateien"])("behält beide Planschritte bei eingerücktem Text %j", zeile => {
  const plan = antwortPlan(`- [ ] Export bauen\n${zeile}\n  - src/export.ts\n- [ ] Export testen`, "n");
  expect(plan?.schritte.map(s => s.titel)).toEqual(["Export bauen", "Export testen"]);
  expect(plan?.schritte[0].beschreibung).toBe(`${zeile.trim()}\n- src/export.ts`);
});
