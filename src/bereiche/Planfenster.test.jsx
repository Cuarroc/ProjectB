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
