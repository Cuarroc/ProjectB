import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChatListe from "./ChatListe";
import { BeispielQuelle } from "../daten/quelle";

it.each([0, 1, 17, 100])("zeigt den Postfachwert %i aus der Quelle, ohne Null-Zähler", zahl => {
  const quelle = new BeispielQuelle(), daten = quelle.lesen();
  daten.kopf.postfach = zahl;
  quelle.aktualisieren(daten);
  const html = renderToStaticMarkup(<ChatListe quelle={quelle} offen umschalten={() => {}} />);
  expect(html).toContain(`aria-label="${zahl ? `Postfach ${zahl > 99 ? "99+, " : ""}${zahl} ${zahl === 1 ? "wartet" : "warten"} auf dich` : "Postfach"}"`);
  if (zahl) expect(html).toContain(`class="rand-zaehler" aria-hidden="true">${zahl > 99 ? "99+" : zahl}</span>`);
  else expect(html).not.toContain('class="rand-zaehler"');
});

it("liest Chats, Todos und Ring aus der Quelle", () => {
  const quelle = new BeispielQuelle(), daten = quelle.lesen();
  daten.chats[0].titel = "Anderer Chat";
  daten.todos = [{ id: "test", text: "Andere Aufgabe", fertig: true }];
  quelle.aktualisieren(daten);
  const html = renderToStaticMarkup(<ChatListe quelle={quelle} offen={false} umschalten={() => {}} />);
  for (const text of ["Anderer Chat", "Andere Aufgabe", "2 / 5", 'aria-expanded="false"', 'id="rand-inhalt" hidden=""']) expect(html).toContain(text);
});
