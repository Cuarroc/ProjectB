import { describe, expect, it, vi } from "vitest";
import { beispiel } from "./beispiel";
import { BeispielQuelle, type Datenquelle } from "./quelle";

describe("BeispielQuelle", () => {
  it("liefert den CSV-Auftrag und drei Agenten in drei verschiedenen Zuständen", () => {
    const quelle: Datenquelle = new BeispielQuelle();
    const daten = quelle.lesen();
    expect(daten.chat.verlauf[0].text).toBe("Exportiere die Paketliste als CSV, mit Spalten für Status und Dauer.");
    expect(daten.agenten).toHaveLength(3);
    expect(new Set(daten.agenten.map(a => a.zustand))).toEqual(new Set(["Arbeitet", "Wartet auf dich", "Fertig"]));
    expect(daten.fragen).toHaveLength(1);
    expect(daten.fragen[0].antwortknoepfe.map(a => a.text)).toEqual(["In Downloads", "Im Projektordner"]);
    expect(daten.kopf.kontingent).toEqual({ claude: 42, codex: 51 });
    expect(daten.kopf.postfach).toBe(3);
  });

  it("meldet zwei fertige von fünf Schritten und leitet den Fortschritt aus ihnen ab", () => {
    const quelle = new BeispielQuelle();
    expect(quelle.lesePlan()).toMatchObject({ fertig: 2, gesamt: 5 });
    const daten = quelle.lesen();
    daten.plan.schritte[2].zustand = "Fertig";
    quelle.aktualisieren(daten);
    expect(quelle.lesePlan()).toMatchObject({ fertig: 3, gesamt: 5 });
  });

  it("meldet den geänderten Datenstand und beendet jedes Abo einzeln", () => {
    const quelle = new BeispielQuelle();
    const gemeldet = vi.fn(() => quelle.lesen().kopf.postfach);
    const abmelden = quelle.abonnieren(gemeldet);
    const zweitesAbmelden = quelle.abonnieren(gemeldet);
    const daten = quelle.lesen();
    daten.kopf.postfach = 4;
    quelle.aktualisieren(daten);
    expect(gemeldet.mock.results.map(r => r.value)).toEqual([4, 4]);
    abmelden(); abmelden();
    quelle.aktualisieren(daten);
    expect(gemeldet).toHaveBeenCalledTimes(3);
    zweitesAbmelden();
    quelle.aktualisieren(daten);
    expect(gemeldet).toHaveBeenCalledTimes(3);
  });

  it("schützt interne Daten und andere Instanzen vor Änderungen an Kopien", () => {
    const eingabe = structuredClone(beispiel);
    const quelle = new BeispielQuelle(eingabe);
    eingabe.agenten[0].name = "Verändert";
    quelle.lesen().agenten[0].name = "Verändert";
    quelle.lesePlan().schritte.splice(0);
    expect(quelle.lesen()).toEqual(beispiel);
    quelle.aktualisieren(eingabe);
    eingabe.agenten[0].name = "Erneut verändert";
    expect(quelle.lesen().agenten[0].name).toBe("Verändert");
    expect(new BeispielQuelle().lesen()).toEqual(beispiel);
  });
});
