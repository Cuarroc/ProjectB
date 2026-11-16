import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Planfenster, { farben, MarkierterText } from "./Planfenster";

const textInhalt = k => Array.isArray(k) ? k.map(textInhalt).join("") : k && typeof k === "object" ? textInhalt(k.props.children) : k ?? "";
it.each(farben)("markiert Text als %s und benennt die Farbe für Screenreader", (name, token, farbname) => {
  const inhalt = MarkierterText({ text: "Text auswählen", marke: { name, start: 5, ende: 14 } }), html = renderToStaticMarkup(inhalt);
  expect(textInhalt(inhalt)).toBe(`Text auswählen (${name}, ${farbname})`);
  expect(html).toContain(`--f:var(--markierung-${token})`);
  expect(html).not.toContain("aria-label");
  expect(new Set(farben.map(f => f[1])).size).toBe(5);
});
it.each([[[], 0], [[{ markierungen: ["Simpler", "Innovativer"] }], 1], [[{ markierungen: ["Simpler"] }, { markierungen: ["Kommentar", "Ausarbeiten"], kommentar: "Bitte klären." }], 2], [[{ kommentar: "Gespeicherter Kommentar" }], 1]])("zählt betroffene Schritte am Rückgabe-Knopf: %j → %i", (feedback, anzahl) => {
  const schritte = [...feedback, { kommentar: "  " }].map((s, i) => ({ id: String(i), titel: "Schritt", beschreibung: "Beispiel", fertigWenn: [], markierungen: [], kommentar: "", ...s }));
  const html = renderToStaticMarkup(<Planfenster daten={{ plan: { titel: "Testplan", schritte }, agenten: [] }} gespeicherteMarken={{}} />);
  expect(html).toContain(`aria-label="Mit Kommentaren zurückgeben, ${anzahl} ${anzahl === 1 ? "Schritt" : "Schritte"} markiert"`);
  expect(html).toContain(`<span class="pl-zaehler" aria-hidden="true">${anzahl}</span>`);
  expect(html).toContain(`<span class="pl-einheit">${anzahl} ${anzahl === 1 ? "Schritt" : "Schritte"}</span>`);
});

it("sperrt alle Bearbeitungsfelder des freigegebenen echten Plans", () => {
  const plan = { titel: "Export", freigabe: "Freigegeben", schritte: [{ id: "s", titel: "CSV", beschreibung: "", fertigWenn: [], markierungen: ["Kommentar"], kommentar: "Umlaute" }] };
  const html = renderToStaticMarkup(<Planfenster daten={{ agenten: [] }} plan={plan} entscheidbar={false} gespeicherteMarken={{}} />);
  const felder = html.match(/<(?:button|textarea)\b[^>]*>/g).filter(s => !s.includes('aria-label="Plan schließen"'));
  expect(felder.every(s => s.includes('disabled=""'))).toBe(true);
  expect(html).toContain("Freigegeben</span>");
});
it("zeigt beim echten Plan ohne Stilwahl keinen Fassungs-Hinweis", () => {
  const plan = { titel: "Export", schritte: [] };
  const html = renderToStaticMarkup(<Planfenster daten={{ agenten: [] }} plan={plan} gespeicherteMarken={{}} />);
  expect(html).not.toContain('aria-pressed="true"');
  expect(html).not.toContain("Nächste Fassung wird");
  expect(renderToStaticMarkup(<Planfenster daten={{ plan, agenten: [] }} gespeicherteMarken={{}} />)).toContain("Nächste Fassung wird ausführlicher.");
});
it.each([false, true])("zeigt Freigabe mit laufendem Chat=%s passend an", laeuft => {
  const plan = { titel: "Export", freigabe: "Freigegeben", schritte: [] };
  const html = renderToStaticMarkup(<Planfenster daten={{ agenten: [] }} plan={plan} laeuft={laeuft} gespeicherteMarken={{}} />);
  expect(html).toContain(`data-zustand="${laeuft ? "arbeitet" : "fertig"}"`);
  expect(html).toContain(laeuft ? "Arbeitet</span>" : "Freigegeben</span>");
});
