import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const tokens = new Map([...css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)]
  .map(([, name, value]) => [name, value.trim()]));

describe("Tokens für die Bereiche und Bausteine von 0.1", () => {
  it("enthält die gemeinsamen Farben, Schriftstile, Flächen und Ebenen", () => {
    const namen = [
      "grund", "flaeche-1", "flaeche-1-oben", "flaeche-2", "flaeche-3", "flaeche-4",
      "text-1", "text-2", "text-3", "text-aus", "text-auf-farbe",
      "akzent", "akzent-grund", "akzent-text", "akzent-tinte",
      "neutral-1", "neutral-2", "neutral-3", "neutral-4", "marke-jetzt",
      "schatten-kante", "schatten-auswahl", "schatten-eingabe", "schatten-senden",
      "schatten-schwebend", "schatten-leuchten-arbeitet", "schatten-leuchten-wartet",
      "rund-segment", "rund-knopf", "rund-liste", "rund-kachel", "rund-karte",
      "rund-eingabe", "rund-bereich", "rund-voll", "scrim", "scrim-unschaerfe",
      "kopf-hoehe", "steuer-hoehe", "leiste-breite", "chat-max-breite",
      "fenster-min-breite", "fenster-min-hoehe", "schrift-minimum",
      ...["klebend", "details", "menue", "scrim", "dialog", "toast", "tooltip"].map(n => `ebene-${n}`),
      ...["titel", "abschnitt", "ueberschrift", "text", "eingabe", "beschriftung",
        "klein", "zahl-gross", "zahl-mittel", "code"].map(n => `schrift-${n}`),
      ...Array.from({ length: 8 }, (_, i) => `abstand-${i + 1}`),
      ...["offen", "arbeitet", "wartet", "fertig", "problem"]
        .flatMap(n => [`status-${n}`, `status-${n}-grund`]),
      "status-arbeitet-text", "status-wartet-text",
    ];
    for (const name of namen) expect(tokens.has(name), name).toBe(true);
  });

  it("stellt Wartezeiten unabhängig von Bewegungsdauern bereit", () => {
    for (const [name, wert] of Object.entries({
      "verzoegerung-laden": "600ms", "verzoegerung-tooltip": "600ms",
      "fenster-tooltip-wechsel": "400ms", "standzeit-toast-info": "6000ms",
    })) expect(tokens.get(name), name).toBe(wert);
  });

  it("stellt Geist bereit und erhält die bisherigen Schriftnamen als Alias", () => {
    expect(tokens.get("font-sans")).toBe('"Geist", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif');
    expect(tokens.get("font-mono")).toBe('"Geist Mono", ui-monospace, Consolas, monospace');
    expect(tokens.get("familie-sans")).toBe("var(--font-sans)");
    expect(tokens.get("familie-mono")).toBe("var(--font-mono)");
  });
});
