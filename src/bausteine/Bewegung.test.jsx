import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Fortschrittsring } from "./Fortschrittsring";
import { Knopf } from "./Knopf";
import { Statusmarke } from "./Statusmarke";

const css = readFileSync(new URL("./bausteine.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../design/tokens.css", import.meta.url), "utf8");
const regel = (selektor) => css.split(`${selektor} {`)[1]?.split("}")[0] ?? "";

describe("Bewegung der Bausteine", () => {
  it("erhält die gemeinsamen Bewegungswerte für weitere Bausteine", () => {
    for (const [name, wert] of Object.entries({ "dauer-lang": "200ms", "kurve-weg": "cubic-bezier(0.4, 0, 1, 1)", "weg-klein": "4px", "weg-mittel": "8px", "weg-gross": "8px", "skala-auf": "0.97" })) {
      expect(tokens).toContain(`--${name}: ${wert};`);
    }
    const reduziert = [...tokens.matchAll(/:root(?:\[data-bewegung=reduziert\]|:not\(\[data-bewegung=voll\]\))\{([^}]+)\}/g)];
    expect(reduziert).toHaveLength(2);
    for (const block of reduziert) {
      for (const wert of ["--dauer-lang:120ms", "--weg-klein:0px", "--weg-mittel:0px", "--weg-gross:0px", "--skala-auf:1"]) expect(block[1]).toContain(wert);
    }
  });
  it("nutzt für Status und Ringmitte in beiden Reduziert-Regeln die ruhige Kurve", () => {
    for (const selektor of [":root[data-bewegung=\"reduziert\"]", ":root:not([data-bewegung=\"voll\"])"]) {
      for (const klasse of [".statusmarke", ".ring-mitte"]) expect(regel(`${selektor} ${klasse}`)).toContain("transition-timing-function: var(--kurve-raus)");
    }
  });
  it("begrenzt Druckzoom auf Maus und schaltet gesperrte Knöpfe sofort um", () => {
    expect(css).toContain(":active:not(:disabled):not(:focus-visible)");
    expect(css).toContain("@media (hover: hover) and (pointer: fine)");
    expect(regel('.knopf[aria-busy="true"]')).toContain("transition: none");
    expect(regel('.knopf:disabled:not([aria-busy="true"])')).toContain("transition: none");
    expect(renderToStaticMarkup(<Knopf text="Senden" laedt ladeText="Sendet …" />)).toContain('aria-disabled="true"');
  });
  it("wechselt Status ohne Zoom und animiert nur die Deckkraft der festen Glanzebene", () => {
    expect(css).not.toMatch(/statusmarke[^}]*\bscale\(/);
    expect(regel("@keyframes hinweis")).toContain("opacity: 1");
    expect(regel("@keyframes hinweis")).not.toContain("box-shadow");
    expect(renderToStaticMarkup(<Statusmarke zustand="wartet" />)).not.toContain('class="hinweis"');
  });
  it("lässt die Umschalter-Pille sofort springen", () => {
    expect(regel(".umschalter-pille")).toContain("transition: none");
  });
  it.each([undefined, null, NaN, Infinity])("zeigt unbekannten Fortschritt (%s) als Strich", wert => {
    const html = renderToStaticMarkup(<Fortschrittsring wert={wert} />);
    expect(html).toContain('aria-label="Fortschritt unbekannt"');
    expect(html).toContain("–</span>");
    expect(html).toContain('visibility="hidden"');
    expect(html).not.toContain("NaN");
  });
  it("unterscheidet bekannten Nullwert und Fertig", () => {
    expect(renderToStaticMarkup(<Fortschrittsring wert={0} />)).toContain("0 %</span>");
    expect(renderToStaticMarkup(<Fortschrittsring wert={100} />)).toContain('data-fertig="true"');
  });
});
