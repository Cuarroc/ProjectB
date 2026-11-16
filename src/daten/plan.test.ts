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
it("ignoriert Code auch zwischen Schritten und behält die letzte Liste wie die Aufgabenanzeige", () => {
  expect(antwortPlan("- [ ] Alt\nNeuer Plan:\n" + text + "\n```\n- [ ] Beispiel\n```", "n")?.schritte.map(s => s.titel)).toEqual(["Export bauen", "Testen", "Prüfen"]);
});
it("baut Kommentare mit Markierungen, Ausarbeiten-Bitte und gewünschter Fassung", () => {
  const plan = antwortPlan(text, "n")!;
  plan.schritte[0].markierungen = ["Ausarbeiten", "Kommentar"]; plan.schritte[0].kommentar = "Auch Umlaute.";
  plan.schritte[1].kommentar = "Bitte genauer.";
  expect(planKommentare(plan, "Simpler")).toBe("Kommentare zum Plan:\n- Export bauen: [Ausarbeiten, Kommentar] Auch Umlaute. Bitte zerlege diesen Schritt in Teilschritte.\n- Testen: [] Bitte genauer.\nGewünschte Fassung: Simpler");
});
