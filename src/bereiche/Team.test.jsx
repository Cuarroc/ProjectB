import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Children, isValidElement } from "react";
import { TeamAnsicht, anhalten } from "./Team";
import { Agentenkarte } from "../bausteine/Agentenkarte";
import { beispiel } from "../daten/beispiel";

const ansicht = (daten = beispiel, aendern = vi.fn(), auswahl = null) => TeamAnsicht({ daten, aendern, auswahl, waehlen: vi.fn() });
const karten = baum => Children.toArray(baum).flatMap(k => !isValidElement(k) ? [] : k.type === Agentenkarte ? [k] : karten(k.props.children));
describe("Team", () => {
  it.each([...new Set(beispiel.agenten.map(a => a.zustand)), "Problem"])("zeigt %s mit Wort und Symbol", zustand => {
    const daten = { ...beispiel, agenten: [{ ...beispiel.agenten[0], zustand }] };
    const html = renderToStaticMarkup(karten(ansicht(daten)).find(k => k.props.name === daten.agenten[0].name));
    const marke = html.match(/<span class="mk">(.*?)<\/span><\/span>/)?.[1];
    expect(marke).toContain(zustand); expect(marke).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain(daten.agenten[0].modell);
  });
  it.each(["kern", "knopf"])("stellt bei %s nach einzelnem und gemeinsamem Anhalten den Vorzustand wieder her", id => {
    for (const alle of [false, true]) {
      let daten = structuredClone(beispiel);
      const original = structuredClone(daten.agenten.find(a => a.id === id));
      const aendern = neu => { daten = structuredClone(neu); };
      const karte = () => karten(ansicht(daten, aendern)).find(k => k.props.name === original.name);
      if (alle) aendern(anhalten(daten)); else karte().props.onAktion();
      aendern(anhalten(daten, id));
      karte().props.onAktion();
      expect(daten.agenten.find(a => a.id === id)).toEqual(original);
    }
  });
  it("ändert über die Kartenaktion nur den gewählten Agenten und lässt Fortsetzen zu", () => {
    let daten = structuredClone(beispiel);
    const aendern = neu => { daten = neu; };
    const karte = () => karten(ansicht(daten, aendern)).find(k => k.props.name === "CSV-Export im Kern");
    expect(karte().props.aktion).toBe("Anhalten"); karte().props.onAktion();
    expect(daten.agenten[1].zustand).toBe("Wartet auf dich");
    expect(daten.agenten[0]).toEqual(beispiel.agenten[0]);
    expect(renderToStaticMarkup(ansicht(daten))).toContain("Angehalten. Weiter mit Fortsetzen.");
    expect(karte().props.aktion).toBe("Fortsetzen"); karte().props.onAktion();
    expect(daten.agenten[1].zustand).toBe("Arbeitet");
  });
  it("hält alle offenen Agenten an, erhält fertige und verändert die Vorlage nicht", () => {
    const daten = anhalten(beispiel);
    expect(daten.agenten.slice(1).every(a => a.liveZeile.startsWith("Angehalten."))).toBe(true);
    expect(daten.agenten[0]).toEqual(beispiel.agenten[0]); expect(beispiel.agenten[1].zustand).toBe("Arbeitet");
  });
  it("begrenzt die Liste auf drei und berechnet Kennzahlen aus den Daten", () => {
    const daten = { ...beispiel, agenten: [...beispiel.agenten, { ...beispiel.agenten[0], id: "vier", name: "Vierter Agent" }] };
    const html = renderToStaticMarkup(ansicht(daten));
    expect(html).not.toContain("Vierter Agent"); expect(html).toContain("26 / 33"); expect(html).toContain("358k");
    expect(html).not.toContain("team-details");
  });
  it("erhält Tokens und Laufzeit neben dem Anhalten-Knopf", () => {
    const html = renderToStaticMarkup(<Agentenkarte name="Test" modell="Codex" zustand="arbeitet" zeitspur={{ jetzt: 0, phasen: [] }} zeile="Testet" tokens="132k" laufzeit="6:12" aktion="Anhalten" />);
    expect(html).toContain("132k"); expect(html).toContain("6:12");
  });
});
