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
  it("zeigt die benannte Berechtigung mit zwei von vier aktiven Stufenbalken", () => {
    const html = renderToStaticMarkup(<Kopf />); expect(html).toContain("Berechtigungen: Nur bei Wichtigem");
    expect(html.match(/data-an="true"/g)).toHaveLength(2); expect(html.match(/data-an="false"/g)).toHaveLength(2);
  });
  it("liest geänderte Kontingente aus derselben Quelle wie der Chat", () => {
    const vorher = chatEingabeQuelle.lesen(), neu = structuredClone(vorher); neu.kopf.kontingent = { claude: 17, codex: 86, soll: 57 };
    try { chatEingabeQuelle.aktualisieren(neu); const html = renderToStaticMarkup(<Kopf />);
      expect(html).toContain("Genutzt 17 %, Soll 57 %"); expect(html).toContain("Genutzt 86 %, Soll 57 %");
      expect(html.match(/class="kopf-soll" style="left:57%"/g)).toHaveLength(2);
      expect(html).toContain("Weiße Marke: Soll 57 %"); expect(html).not.toContain("Soll 48 %");
    } finally { chatEingabeQuelle.aktualisieren(vorher); }
  });
});
