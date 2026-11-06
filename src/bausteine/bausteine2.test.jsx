import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { Zeitspur } from "./Zeitspur";
import { Agentenkarte } from "./Agentenkarte";
import { Kachel } from "./Kachel";

const spur = { jetzt: 60, bis: 120, phasen: [{ art: "bauen", name: "Bauen", start: 10, ende: 60, laufend: true }] };
describe("Zeitspur und Kennzahlen", () => {
  it("zeigt nach überschrittener Schätzung keine negative Restzeit", () => {
    const html = renderToStaticMarkup(<Zeitspur {...spur} schaetzung={50} />);
    expect(html).toContain("Dauert länger als geschätzt"); expect(html).not.toContain('class="zs-schaetzung"');
  });
  it("trennt kurze Kapseln mit 2 px und behält die genaue Zeit als zugänglichen Namen", () => {
    const html = renderToStaticMarkup(<Zeitspur {...spur} />);
    expect(html).toContain("- var(--abstand-1) / 2"); expect(html).toContain("Bauen · 0:50 min · 14:30:10 bis 14:31:00");
  });
  it.each(["fertig", "problem", "wartet", "startet"])("zeigt bei %s keine Schätzung", zustand => {
    expect(renderToStaticMarkup(<Zeitspur {...spur} zustand={zustand} schaetzung={100} />)).not.toContain('class="zs-schaetzung"');
  });
  it.each(["offen", "arbeitet", "wartet", "fertig", "problem"])("benennt %s zusätzlich zum Symbol", zustand => {
    const html = renderToStaticMarkup(<Agentenkarte name="Export" modell="Codex" zustand={zustand} zeitspur={spur} tokens="0" laufzeit="0:01" zeile="Noch keine Ausgabe" />);
    expect(html).toContain({ offen: "Offen", arbeitet: "Arbeitet", wartet: "Wartet auf dich", fertig: "Fertig", problem: "Problem" }[zustand]); expect(html).toMatch(/class="mk"><svg/);
  });
  it("unterscheidet null und unbekannt", () => {
    expect(renderToStaticMarkup(<Kachel titel="Tests" zahl="0" unterzeile="Keine grün" />)).toContain('ka-zahl">0');
    expect(renderToStaticMarkup(<Kachel titel="Tests" zustand="leer" unterzeile="Noch keine Tests" />)).toContain('ka-leer">–');
  });
  it("hält 4,5:1 über jeden Phasenverlauf einschließlich maximalem animierten Glanz", () => {
    const css = readFileSync(new URL("../design/tokens.css", import.meta.url), "utf8");
    const bausteinCss = readFileSync(new URL("./bausteine2.css", import.meta.url), "utf8"), glanz = Number(bausteinCss.match(/\.zs-lebt::before\{[^}]*var\(--phase-text\) (\d+)%/)[1]) / 100;
    const rgb = (name) => css.match(new RegExp(`--${name}: #([A-Fa-f0-9]{6})`))[1].match(/../g).map(v => parseInt(v, 16) / 255);
    const luminanz = (c) => c.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
    for (const phase of ["lesen", "koordiniert", "bauen", "testen", "review"]) for (let i = 0; i <= 100; i++) {
      const a = rgb(`phase-${phase}`), b = rgb(`phase-${phase}-ende`), farbe = a.map((v, n) => (v + (b[n] - v) * i / 100) * (1 - glanz) + glanz);
      expect((luminanz(rgb("phase-text")) + .05) / (luminanz(farbe) + .05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
