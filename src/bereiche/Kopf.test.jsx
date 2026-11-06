import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Kopf, { bewegungSetzen, bewegungAktuell } from "./Kopf";
import { chatEingabeQuelle } from "./ChatEingabe";

describe("Kopf", () => {
  it.each(["auto", "voll", "reduziert"])("setzt %s am äußersten Element und folgt bei Automatisch Windows", wahl => {
    const wurzel = { dataset: {} }; bewegungSetzen(wahl, wurzel);
    expect(wurzel.dataset.bewegung).toBe(wahl);
    expect(bewegungAktuell(wahl, true)).toBe(wahl === "auto" ? "reduziert" : wahl);
    expect(bewegungAktuell(wahl, false)).toBe(wahl === "auto" ? "voll" : wahl);
  });
  it("zeigt Kontingent mit Zahlen, Genutzt und benannter Soll-Marke", () => {
    const html = renderToStaticMarkup(<Kopf />);
    for (const text of ["Claude", "Codex", "42", "51", "Genutzt", "Soll 48 %", "kopf-soll"]) expect(html).toContain(text);
  });
  it("liest geänderte Kontingente aus derselben Quelle wie der Chat", () => {
    const vorher = chatEingabeQuelle.lesen(), neu = structuredClone(vorher); neu.kopf.kontingent = { claude: 17, codex: 86 };
    try { chatEingabeQuelle.aktualisieren(neu); const html = renderToStaticMarkup(<Kopf />);
      expect(html).toContain("Genutzt 17 %, Soll 48 %"); expect(html).toContain("Genutzt 86 %, Soll 48 %");
    } finally { chatEingabeQuelle.aktualisieren(vorher); }
  });
});
