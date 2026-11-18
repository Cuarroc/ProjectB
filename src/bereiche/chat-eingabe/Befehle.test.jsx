import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Befehle } from "./Befehle";
import { Eingabefeld } from "../../bausteine/Eingabefeld";
import { ChatEingabeAnsicht } from "../ChatEingabe";
import { BeispielQuelle } from "../../daten/quelle";
const h = vi.hoisted(() => ({ werte: [], i: 0 }));
vi.mock("react", async original => ({ ...await original(),
  useState: initial => { const i = h.i++; return [h.werte[i] ??= initial, wert => { h.werte[i] = wert; }]; },
  useSyncExternalStore: (_ab, lesen) => lesen(),
}));
let text, ausfuehren, senden, chat, anzahl, neuGesperrt, laeuft, projektOffen;
const ansicht = () => { h.i = 0; const el = ChatEingabeAnsicht({ chat, modelle: [chat.modell], text, anzahl, neuGesperrt, laeuft, projektOffen, fehler: "",
  aendern: vi.fn(), schreiben: wert => { text = wert; }, senden, befehl: ausfuehren }).props.children.find(el => el?.type === Befehle);
  return Befehle(el.props); };
const eingabe = () => Eingabefeld(ansicht().props.children.at(-1).props);
const abschicken = () => eingabe().props.onSubmit({ preventDefault() {} });
const feld = () => Eingabefeld(ansicht().props.children.at(-1).props).props.children[1];
const tippen = wert => feld().props.onChange({ target: { value: wert } });
const taste = (key, extra = {}) => { const e = { key, nativeEvent: {}, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
  feld().props.onKeyDown(e); return e; };
beforeEach(() => { h.werte = []; text = "/"; chat = new BeispielQuelle().lesen().chats[0]; anzahl = 2; neuGesperrt = false; laeuft = false; projektOffen = true; chat.gestartetUm = null;
  ausfuehren = vi.fn(name => { if (name === "planen") chat.modus = "Planen"; }); senden = vi.fn(); });
it.each(["/planen", "  /PLANEN \n"])("führt %j mit Senden aus und leert das Feld", wert => {
  tippen(wert); abschicken(); expect(chat.modus).toBe("Planen");
  expect(ausfuehren).toHaveBeenCalledWith("planen"); expect(senden).not.toHaveBeenCalled(); expect(text).toBe("");
});
it("blockiert /anhalten mit Senden und zeigt den Eingabefehler", () => {
  anzahl = 0; tippen("/anhalten"); abschicken();
  expect(senden).not.toHaveBeenCalled(); expect(ausfuehren).not.toHaveBeenCalled(); expect(text).toBe("/anhalten");
  expect(renderToStaticMarkup(eingabe())).toContain("Kein Agent läuft.");
});
it.each(["Enter", "Senden"])("sperrt /neu bei ladenden Rollen mit %s und behält den Text", weg => {
  neuGesperrt = true; tippen("/neu");
  expect(renderToStaticMarkup(ansicht())).toMatch(/disabled=""[^]*Rollen laden …/);
  if (weg === "Enter") taste("Enter"); else abschicken();
  expect(ausfuehren).not.toHaveBeenCalled(); expect(senden).not.toHaveBeenCalled(); expect(text).toBe("/neu");
  neuGesperrt = false; taste("Enter"); expect(ausfuehren).toHaveBeenCalledWith("neu"); expect(text).toBe("");
});
it.each(["/planen bitte", "/xyz"])("sendet %j mit Senden als Nachricht", wert => {
  tippen(wert); abschicken(); expect(senden).toHaveBeenCalledWith(wert); expect(ausfuehren).not.toHaveBeenCalled();
});
it("führt /planen nach Esc mit Enter aus", () => {
  tippen("/planen"); taste("Escape"); taste("Enter");
  expect(chat.modus).toBe("Planen"); expect(senden).not.toHaveBeenCalled(); expect(text).toBe("");
});
it("filtert Befehle nach dem eingegebenen Präfix", () => {
  expect(renderToStaticMarkup(ansicht())).toContain("/neu"); tippen("/PLAN");
  const html = renderToStaticMarkup(ansicht()); expect(html).toContain("/planen"); expect(html).not.toContain("/neu"); expect(html).not.toContain("/kompakt");
});
it.each(["Hallo /", "/neu ", "/neu\n"])("öffnet bei %j keine Liste", wert => {
  tippen(wert); expect(renderToStaticMarkup(ansicht())).not.toContain('role="listbox"');
});
it("wählt mit Pfeilen, führt aus und sendet bei offener Liste nicht", () => {
  taste("ArrowDown"); taste("ArrowDown"); taste("ArrowDown"); taste("ArrowUp");
  expect(feld().props["aria-activedescendant"]).toBe("befehl-planen"); taste("Enter");
  expect(ausfuehren).toHaveBeenCalledWith("planen"); expect(senden).not.toHaveBeenCalled(); expect(text).toBe("");
});
it("schließt mit Esc, sendet danach normal und öffnet beim Tippen wieder", () => {
  expect(taste("Escape").defaultPrevented).toBe(true); expect(renderToStaticMarkup(ansicht())).not.toContain('role="listbox"');
  taste("Enter"); expect(senden).toHaveBeenCalledWith("/"); tippen("/n"); expect(renderToStaticMarkup(ansicht())).toContain('role="listbox"');
});
it("meldet unbekannte Befehle und sendet sie mit Enter normal", () => {
  tippen("/xyz"); expect(renderToStaticMarkup(ansicht())).toContain("Kein Befehl gefunden");
  taste("Enter"); expect(senden).toHaveBeenCalledWith("/xyz"); expect(ausfuehren).not.toHaveBeenCalled();
});
it("führt während IME oder mit Umschalt+Enter keinen Befehl aus", () => {
  taste("Enter", { nativeEvent: { isComposing: true } }); taste("Enter", { keyCode: 229 }); taste("Enter", { shiftKey: true });
  expect(ausfuehren).not.toHaveBeenCalled(); expect(senden).not.toHaveBeenCalled();
});

it.each(["läuft", "leer", "Projekt"])("sperrt /kompakt bei %s in Liste und Fehlerzeile", fall => {
  const grund = fall === "läuft" ? "Dieser Chat läuft bereits" : fall === "leer" ? "Noch nichts zusammenzufassen" : "Bitte zuerst oben ein Projekt öffnen";
  if (fall === "läuft") laeuft = true;
  if (fall === "leer") chat.verlauf = [{ von: "Du", text: "Hallo", aktionen: [] }];
  if (fall === "Projekt") projektOffen = false;
  tippen("/kompakt"); const html = renderToStaticMarkup(ansicht()); expect(html).toContain('disabled=""'); expect(html).toContain(grund);
  taste("Enter"); expect(renderToStaticMarkup(eingabe())).toContain(grund); expect(ausfuehren).not.toHaveBeenCalled(); expect(senden).not.toHaveBeenCalled();
});
it("zeigt /kompakt zuerst mit gerundetem Kontext und führt es aus", () => {
  chat.kontextProzent = 37.6; const html = renderToStaticMarkup(ansicht());
  expect(html.indexOf("/kompakt")).toBeLessThan(html.indexOf("/neu")); expect(html).toContain("38 % belegt");
  taste("Enter"); expect(ausfuehren).toHaveBeenCalledWith("kompakt"); expect(senden).not.toHaveBeenCalled();
});
