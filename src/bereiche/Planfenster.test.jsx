import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Planfenster, { farben, MarkierterText } from "./Planfenster";
import { beispiel } from "../daten/beispiel";

it.each([1, 2, 3, null])("zeigt vier Pillen und neutrale Risikostufen: %s", risiko => {
  const schritt = { ...beispiel.plan.schritte[0], agentId: "kern", dauerMinuten: 6, tokens: 40000, risiko };
  const html = renderToStaticMarkup(<Planfenster daten={beispiel} plan={{ ...beispiel.plan, schritte: [schritt] }} gespeicherteMarken={{}} />);
  expect(html.match(/class="pl-chip"/g)).toHaveLength(4);
  for (const text of ["Codex · gpt-6.1-sol", "~6 min", "~40k Tokens"]) expect(html).toContain(text);
  expect(html).toContain('class="pl-risiko" aria-hidden="true"');
  const risikoChip = html.match(/<span class="pl-chip">Risiko .*?<\/span>/)[0];
  expect(risikoChip.match(/data-voll="true"/g) ?? []).toHaveLength(risiko ?? 0);
  expect(html).toMatch(new RegExp(`<span class="pl-chip">Risiko <span class="pl-risiko" aria-hidden="true">(?:<i data-voll="(?:true|false)"></i>){3}</span> ${["–", "Niedrig", "Mittel", "Hoch"][risiko ?? 0]}</span>`));
});
it("zeigt unbekannte Werte ohne Null oder Schätzzeichen und behält Agenten-Tokens als Ersatz", () => {
  const schritt = { ...beispiel.plan.schritte[0], dauerMinuten: null, tokens: null, risiko: null };
  const anzeigen = agentId => renderToStaticMarkup(<Planfenster daten={beispiel} plan={{ ...beispiel.plan, schritte: [{ ...schritt, agentId }] }} gespeicherteMarken={{}} />);
  const html = anzeigen(null);
  for (const text of ["Orchestrator", "– min", "– Tokens"]) expect(html).toContain(text);
  expect(html).not.toMatch(/0 min|~–/);
  expect(anzeigen("kern")).toContain("132k Tokens");
});

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
it.each([false, true])("zeigt genau eine Statusmarke im freigegebenen Plan, laufender Chat=%s", laeuft => {
  const plan = { titel: "Export", freigabe: "Freigegeben", schritte: [] };
  const html = renderToStaticMarkup(<Planfenster daten={{ agenten: [] }} plan={plan} laeuft={laeuft} gespeicherteMarken={{}} />);
  const marken = html.match(/<span class="statusmarke\b.*?<\/span>([^<]+)<\/span>/g);
  expect(marken).toHaveLength(1);
  expect(marken[0]).toContain(laeuft ? "Arbeitet</span>" : "Freigegeben</span>");
  expect(html.match(/Freigegeben/g) ?? []).toHaveLength(laeuft ? 0 : 1);
  expect(html).not.toContain("Fertig</span>");
});
