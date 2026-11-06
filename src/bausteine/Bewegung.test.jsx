import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Fortschrittsring } from "./Fortschrittsring";
import { Knopf } from "./Knopf";
import { Statusmarke } from "./Statusmarke";
import { Umschalter } from "./Umschalter";

const css = readFileSync(new URL("./bausteine.css", import.meta.url), "utf8");
const regel = (selektor) => css.split(`${selektor} {`)[1]?.split("}")[0] ?? "";

describe("Bewegung der Bausteine", () => {
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
    expect(renderToStaticMarkup(<Umschalter moeglichkeiten={["Karten", "Board"]} wert="Board" beschriftung="Ansicht" onChange={() => {}} />)).not.toContain("gleitet");
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
