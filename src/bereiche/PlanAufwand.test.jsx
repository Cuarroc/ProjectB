import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Planfenster from "./Planfenster";
import { beispiel } from "../daten/beispiel";

const anzeigen = (schritte = beispiel.plan.schritte, chats = beispiel.chats) => renderToStaticMarkup(
  <Planfenster daten={{ ...beispiel, chats }} plan={{ ...beispiel.plan, schritte }} gespeicherteMarken={{}} />);
const kachel = (html, name) => html.match(new RegExp(`<section[^>]*aria-label="${name}"[^>]*>(.*?)</section>`))[1];
it("zeigt Dezimalzahlen auf der Achse mit deutschem Komma", () => {
  const html = anzeigen([{ ...beispiel.plan.schritte[0], dauerMinuten: 5 }]);
  expect(html).toContain('<span>0</span><span>2,5</span><span>5 min</span>');
});
it("summiert nur bekannte Schätzungen und nutzt das Kontextfenster des aktiven Chats", () => {
  const html = anzeigen(undefined, [{ ...beispiel.chats[0], id: "anderer", kontextfenster: 1 }, { ...beispiel.chats[0], kontextfenster: 500000 }]);
  expect(kachel(html, "Aufwand")).toContain("~18 min");
  expect(kachel(html, "Aufwand")).toContain("– %");
  expect(kachel(html, "Aufwand")).toContain('width:0%');
  expect(kachel(html, "Aufwand")).toContain("Kein Zeitlimit gesetzt");
  for (const text of ["~115k", "23 %", "width:23%", "Von 500k Kontext"]) expect(kachel(html, "Tokens")).toContain(text);
  expect(html).toContain("Summe ~18 min in 4 von 5 Schritten.");
  expect(anzeigen(beispiel.plan.schritte.slice(1))).toContain("Summe ~18 min in 4 Schritten.");
  expect(kachel(anzeigen(), "Tokens")).toContain("Von 1M Kontext");
});
it("zeigt bei lauter null oder leerem Plan unbekannt statt null oder erfundener Summen", () => {
  for (const schritte of [[], beispiel.plan.schritte.map(s => ({ ...s, dauerMinuten: null, tokens: null, risiko: null }))]) {
    const html = anzeigen(schritte);
    for (const name of ["Aufwand", "Tokens", "Risiko"]) expect(kachel(html, name)).toContain("<strong>–</strong>");
    expect(html).not.toMatch(/Summe ~0|Am höchsten bei Schritt|class="pl-balken"/);
  }
  expect(kachel(anzeigen(undefined, []), "Tokens")).toContain("– %");
});
it("nennt beim höchsten Risiko den ersten Schritt und zeichnet anteilige Balken mit Zeilenlabels", () => {
  const html = anzeigen();
  expect(kachel(html, "Risiko")).toContain("Mittel");
  expect(kachel(html, "Risiko")).toContain("2 / 3");
  expect(kachel(html, "Risiko")).toContain("Am höchsten bei Schritt 4");
  expect(kachel(anzeigen(beispiel.plan.schritte.map(s => ({ ...s, risiko: 3 }))), "Risiko")).toContain("Am höchsten bei Schritt 1");
  const breiten = [...html.matchAll(/class="pl-balken" style="width:([\d.]+)%"/g)].map(m => Number(m[1]));
  expect(breiten).toHaveLength(4);
  [4, 6, 5, 3].forEach((dauer, i) => expect(breiten[i]).toBeCloseTo(dauer / 6 * 100));
  for (const [i, s] of beispiel.plan.schritte.entries()) expect(html).toContain(
    `tabindex="0" aria-label="Schritt ${i + 1}, ${s.titel}, ${s.dauerMinuten == null ? "–" : `~${s.dauerMinuten}`} min, Risiko ${["–", "Niedrig", "Mittel", "Hoch"][s.risiko ?? 0]}"`);
  expect(html).toContain('<span>0</span><span>3</span><span>6 min</span>');
});
