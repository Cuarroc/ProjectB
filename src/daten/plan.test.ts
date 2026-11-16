import { expect, it } from "vitest";
import { antwortPlan, planKommentare } from "./plan";

const text = "Mein Plan:\n- [ ] Export bauen\n  Vorhandenen Export ergänzen.\n  Fertig, wenn CSV stimmt.\n  - Fertig, wenn Umlaute stimmen.\n- [x] Testen\n  Leere Listen prüfen.\n  Fertig, wenn Tests grün sind.\n- [ ] Prüfen\n  Fertig, wenn Review fertig ist.";
it("erkennt drei Schritte mit Beschreibung, Kriterien und leeren Arbeitsfeldern", () => {
  const plan = antwortPlan(text, "antwort")!;
  expect(plan.id).toBe("antwort"); expect(plan.schritte).toHaveLength(3);
  expect(plan.schritte[0]).toMatchObject({ titel: "Export bauen", beschreibung: "Vorhandenen Export ergänzen.", agentId: null, zustand: "Offen", dauerMinuten: 0, kommentar: "", markierungen: [],
    fertigWenn: [{ text: "CSV stimmt.", erfuellt: false }, { text: "Umlaute stimmen.", erfuellt: false }] });
  expect(plan.schritte[1].titel).toBe("Testen"); expect(plan.schritte[2].beschreibung).toBe("");
});
it.each(["Kein Plan.", "```md\n- [ ] Beispiel\n```", "~~~md\n- [x] Beispiel\n~~~"])("erzeugt ohne echte Liste keinen Plan: %s", text => {
  expect(antwortPlan(text, "n")).toBeUndefined();
});
it("ignoriert Code und behält alle Aufgabenpunkte der Antwort", () => {
  expect(antwortPlan("- [ ] Alt\nNeuer Plan:\n" + text + "\n```\n- [ ] Beispiel\n```", "n")?.schritte.map(s => s.titel)).toEqual(["Alt", "Export bauen", "Testen", "Prüfen"]);
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
