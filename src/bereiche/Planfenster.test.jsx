import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { farben, MarkierterText } from "./Planfenster";

it.each(farben)("markiert Text als %s und benennt die Farbe für Screenreader", (name, token, farbname) => {
  const html = renderToStaticMarkup(<MarkierterText text="Text auswählen" marke={{ name, start: 5, ende: 14 }} />);
  expect(html).toContain(`Text <mark style="--f:var(--markierung-${token})" aria-label="${name}, ${farbname}">auswählen</mark>`);
  expect(new Set(farben.map(f => f[1])).size).toBe(5);
});
