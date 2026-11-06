import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { farben, MarkierterText } from "./Planfenster";

const textInhalt = k => Array.isArray(k) ? k.map(textInhalt).join("") : k && typeof k === "object" ? textInhalt(k.props.children) : k ?? "";
it.each(farben)("markiert Text als %s und benennt die Farbe für Screenreader", (name, token, farbname) => {
  const inhalt = MarkierterText({ text: "Text auswählen", marke: { name, start: 5, ende: 14 } }), html = renderToStaticMarkup(inhalt);
  expect(textInhalt(inhalt)).toBe(`Text auswählen (${name}, ${farbname})`);
  expect(html).toContain(`--f:var(--markierung-${token})`);
  expect(html).not.toContain("aria-label");
  expect(new Set(farben.map(f => f[1])).size).toBe(5);
});
