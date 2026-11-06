import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { stufeUebernehmen } from "./Berechtigungen";
import Kopf from "./Kopf";
import { chatEingabeQuelle } from "./ChatEingabe";
import { interviewAntwort, interviewFragen, InterviewZusammenfassung } from "./Interview";

describe("Interview und Berechtigungen", () => {
  it("zeigt die übernommene Stufe im Kopf und behält sie bei einem Fehler", () => {
    const vorher = chatEingabeQuelle.lesen();
    try {
      expect(stufeUebernehmen(chatEingabeQuelle, "Autonom", false)).toBe("");
      expect(renderToStaticMarkup(<Kopf />)).toContain('aria-label="Berechtigungen: Autonom"');
      expect(stufeUebernehmen(chatEingabeQuelle, "Vorsichtig", true)).toBe("Nicht übernommen. Die alte Stufe gilt weiter.");
      expect(chatEingabeQuelle.lesen().berechtigungen.aktuell).toBe("Autonom");
      expect(renderToStaticMarkup(<Kopf />)).toContain('aria-label="Berechtigungen: Autonom"');
    } finally { chatEingabeQuelle.aktualisieren(vorher); }
  });
  it("nimmt je Schritt eine Antwort und zeigt auch alle freien Ergänzungen", () => {
    let antworten = []; expect(interviewAntwort(antworten, "", "  ")).toBe(antworten);
    for (const [i, frage] of interviewFragen.entries()) {
      antworten = interviewAntwort(antworten, i === 1 ? "" : frage.optionen[0], `Freie Antwort ${i}`);
      expect(antworten).toHaveLength(i + 1);
    }
    expect(interviewAntwort(antworten, "Weitere", "Antwort")).toBe(antworten);
    const html = renderToStaticMarkup(<InterviewZusammenfassung antworten={antworten} />);
    for (const [i, frage] of interviewFragen.entries()) { expect(html).toContain(frage.text); expect(html).toContain(`Freie Antwort ${i}`); }
    expect(html).toContain("Nur ich"); expect(html).toContain("Im Projektordner");
  });
});
