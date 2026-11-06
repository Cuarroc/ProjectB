import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChatVerlauf from "./ChatVerlauf";
import { BeispielQuelle } from "../daten/quelle";

it("liest den aktiven Chat, Fragen, Aktionen und Bedingungen aus der Quelle", () => {
  const quelle = new BeispielQuelle(), daten = quelle.lesen();
  const chat = daten.chats.find(c => c.id === daten.aktiverChatId);
  chat.verlauf[0].text = "Ein anderer Auftrag";
  chat.verlauf[0].aktionen = [{ id: "merken", text: "Merken" }];
  daten.fragen[0].text = "Eine andere Frage";
  daten.fragen[0].antwortknoepfe[0].text = "Eine andere Antwort";
  daten.plan.schritte[2].fertigWenn[0].text = "Eine andere Bedingung";
  quelle.aktualisieren(daten);
  const html = renderToStaticMarkup(<ChatVerlauf quelle={quelle} />);
  for (const text of ["Ein anderer Auftrag", "Merken", "Eine andere Frage", "Eine andere Antwort", "Eine andere Bedingung", "Plan · 1 / 3 fertig"])
    expect(html).toContain(text);
  expect(html).not.toContain("Exportiere die Paketliste als CSV");
  expect(html).toContain('data-erfuellt="false"');
  expect(html).toContain('aria-label="Offen"');
});

it("zeigt bei fehlendem aktiven Chat keinen fremden Verlauf", () => {
  const quelle = new BeispielQuelle(), daten = quelle.lesen();
  daten.aktiverChatId = null; quelle.aktualisieren(daten);
  expect(renderToStaticMarkup(<ChatVerlauf quelle={quelle} />)).not.toContain("Exportiere die Paketliste");
});
