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
  daten.agenten[1].anbieter = "Claude"; daten.agenten[1].fortschritt = 23;
  quelle.aktualisieren(daten);
  const html = renderToStaticMarkup(<ChatVerlauf quelle={quelle} />);
  for (const text of ["Ein anderer Auftrag", "Merken", "Eine andere Frage", "Eine andere Antwort", "Eine andere Bedingung", "Plan · 1 / 3 fertig"])
    expect(html).toContain(text);
  expect(html).not.toContain("Exportiere die Paketliste als CSV");
  expect(html).toContain('data-erfuellt="false"');
  expect(html).toContain('aria-label="Offen"');
  expect(html).toContain('aria-valuenow="23"');
  expect(html.match(/class="r-plan-wer">Claude/g)).toHaveLength(2);
});

it("zeigt bei fehlendem aktiven Chat keinen fremden Verlauf", () => {
  const quelle = new BeispielQuelle(), daten = quelle.lesen();
  daten.aktiverChatId = null; quelle.aktualisieren(daten);
  expect(renderToStaticMarkup(<ChatVerlauf quelle={quelle} />)).not.toContain("Exportiere die Paketliste");
});

it("hebt die Planfreigabe hervor und erhält Kommentar- und Antwortvarianten", () => {
  const quelle = new BeispielQuelle(), daten = quelle.lesen();
  const chat = daten.chats.find(c => c.id === daten.aktiverChatId);
  chat.verlauf = [{ id: "plan", von: "Orchestrator", zeit: "12:00", text: "Plan", aktionen: [
    { id: "plan-freigeben", text: "Freigeben und bauen" },
    { id: "plan-kommentieren", text: "Mit Kommentaren zurückgeben" },
    { id: "antwort-0", text: "Ja", antwort: "Ja" },
  ] }];
  quelle.aktualisieren(daten);
  const html = renderToStaticMarkup(<ChatVerlauf quelle={quelle} onAktion={() => {}} />);
  for (const [text, variante] of [["Freigeben und bauen", "haupt"], ["Mit Kommentaren zurückgeben", "zweit"], ["Ja", "antwort"]])
    expect(html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g).find(b => b.includes(`>${text}<`))).toContain(`data-variante="${variante}"`);
});
