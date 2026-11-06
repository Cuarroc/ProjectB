import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Children } from "react";
import { BeispielQuelle } from "../../daten/quelle";
import { Eingabefeld } from "../../bausteine/Eingabefeld";
import ChatEingabe, { ChatEingabeAnsicht, nachrichtAblegen } from "../ChatEingabe";

it("startet mit Ausführen, Opus 5.5, Hoch und 1M aus den Beispieldaten", () => {
  const html = renderToStaticMarkup(<ChatEingabe quelle={new BeispielQuelle()} />);
  expect(html).toMatch(/aria-checked="true"[^]*?Ausführen/);
  for (const label of ["Modell: Opus 5.5", "Effort: Hoch", "Kontext zu 10 % belegt · Fenster 1M"]) expect(html).toContain(label);
  expect(html).toContain('aria-describedby="modus-hilfe"');
  expect(html).not.toContain("Bild oder Datei anhängen");
});
it("verdrahtet Enter mit dem Beispielzustand; Umschalt+Enter und IME senden nicht", () => {
  const quelle = new BeispielQuelle(), daten = quelle.lesen(), chat = daten.chats[0], senden = vi.fn(text => nachrichtAblegen(quelle, text));
  const ansicht = ChatEingabeAnsicht({ chat, modelle: [chat.modell], text: "Neue Nachricht", fehler: "", aendern: vi.fn(), schreiben: vi.fn(), senden });
  const huelle = Children.toArray(ansicht.props.children).find(el => el.type === Eingabefeld);
  const feld = Eingabefeld(huelle.props).props.children[1];
  for (const extra of [{ shiftKey: true }, { nativeEvent: { isComposing: true } }, { keyCode: 229 }])
    feld.props.onKeyDown({ key: "Enter", nativeEvent: {}, preventDefault: vi.fn(), ...extra });
  expect(senden).not.toHaveBeenCalled();
  feld.props.onKeyDown({ key: "Enter", nativeEvent: {}, preventDefault: vi.fn() });
  expect(senden).toHaveBeenCalledOnce();
  expect(quelle.lesen().chats[0].verlauf.at(-1)).toMatchObject({ von: "Du", text: "Neue Nachricht" });
  expect(quelle.lesen().chats[0].verlauf).toHaveLength(chat.verlauf.length + 1);
});
it("zeigt unbekannten Kontext neutral und verknüpft Fehler und Moduserklärung", () => {
  const quelle = new BeispielQuelle(), daten = quelle.lesen(); daten.chats[0].kontextProzent = NaN; quelle.aktualisieren(daten);
  const html = renderToStaticMarkup(<ChatEingabe quelle={quelle} />);
  expect(html).toContain("Kontext zu – belegt"); expect(html).toContain('data-unbekannt="true"'); expect(html).not.toContain("0 %");
  const fehler = renderToStaticMarkup(<Eingabefeld id="t" text="Text" onSenden={() => {}} onTextAendern={() => {}} beschreibungId="hilfe" fehler="Nicht gesendet." />);
  expect(fehler).toContain('aria-describedby="hilfe t-meldung"'); expect(fehler).toContain('aria-live="polite"');
});
