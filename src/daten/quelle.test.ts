import { describe, expect, it, vi } from "vitest";
import { beispiel } from "./beispiel";
import { BeispielQuelle, type Datenquelle } from "./quelle";

describe("BeispielQuelle", () => {
  it("liefert Dateien, letzte Zeilen, Testverlauf und Schätzung für die Team-Details", () => {
    const agent = new BeispielQuelle().lesen().agenten.find(a => a.id === "kern")!;
    expect(agent.dateien).toEqual([{ pfad: "src/export.rs", hinzugefuegt: 84, entfernt: 3 },
      { pfad: "tests/export.rs", hinzugefuegt: 41, entfernt: 0 }, { pfad: "Cargo.toml", hinzugefuegt: 1, entfernt: 0 }]);
    expect(agent.letzteZeilen).toEqual(["test export::csv_kopfzeile … ok",
      "test export::csv_leer … ok", "test export::csv_umlaute … ok"]);
    expect(agent.tests).toMatchObject({ gruenSeit: "14:34", gruen: 14, gesamt: 21 });
    expect(agent.tests!.verlauf).toContainEqual({ zeit: "14:35", rot: 3 });
    expect(agent.schaetzung).toEqual({ fertigUm: "14:39", restMinuten: 2 });
  });

  it("liefert eine Chat-Liste mit aktivem Chat und Startzeit und kann den Chat wechseln", () => {
    const quelle = new BeispielQuelle();
    const daten = quelle.lesen();
    expect(daten.chats?.find(c => c.id === daten.aktiverChatId)?.gestartetUm).toBe("14:30");
    daten.chats.push({ ...daten.chats[0], id: "zweiter", titel: "Zweiter Auftrag", verlauf: [] });
    daten.aktiverChatId = "zweiter";
    quelle.aktualisieren(daten);
    expect(quelle.lesen().chats.find(c => c.id === quelle.lesen().aktiverChatId)?.titel).toBe("Zweiter Auftrag");
  });

  it("liefert Schrittbeschreibungen und den Freigabestand des Plans", () => {
    const quelle = new BeispielQuelle();
    expect(quelle.lesePlan().schritte.find(s => s.id === "kern")?.beschreibung)
      .toBe("Der Kern liefert die Daten, alles andere baut darauf auf.");
    expect(quelle.lesePlan().freigabe).toBe("Freigegeben");
    const daten = quelle.lesen();
    daten.plan.freigabe = "Wartet auf dich";
    quelle.aktualisieren(daten);
    expect(quelle.lesePlan().freigabe).toBe("Wartet auf dich");
  });

  it("liefert drei Aufgaben für den Todo-Zähler", () => {
    expect(new BeispielQuelle().lesen().todos).toHaveLength(3);
  });

  it("liefert den CSV-Auftrag und drei Agenten in drei verschiedenen Zuständen", () => {
    const quelle: Datenquelle = new BeispielQuelle();
    const daten = quelle.lesen();
    expect(daten.chats.find(c => c.id === daten.aktiverChatId)?.verlauf[0].text)
      .toBe("Exportiere die Paketliste als CSV, mit Spalten für Status und Dauer.");
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
