import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Befehle } from "./Befehle";
import { Eingabefeld } from "../../bausteine/Eingabefeld";
const h = vi.hoisted(() => ({ werte: [], i: 0 }));
vi.mock("react", async original => ({ ...await original(),
  useState: initial => { const i = h.i++; return [h.werte[i] ??= initial, wert => { h.werte[i] = wert; }]; },
  useSyncExternalStore: (_ab, lesen) => lesen(),
}));
let text, ausfuehren, senden;
const ansicht = () => { h.i = 0; return Befehle({ text, anzahl: 2, ausfuehren, children: feld =>
  <Eingabefeld id="test" text={text} onTextAendern={wert => { text = wert; }} onSenden={senden} feld={feld} /> }); };
const feld = () => Eingabefeld(ansicht().props.children.at(-1).props).props.children[1];
const tippen = wert => feld().props.onChange({ target: { value: wert } });
const taste = (key, extra = {}) => { const e = { key, nativeEvent: {}, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
  feld().props.onKeyDown(e); return e; };
beforeEach(() => { h.werte = []; text = "/"; ausfuehren = vi.fn(() => { text = ""; }); senden = vi.fn(); });
it("filtert Befehle und zeigt weder kompakt noch leere Treffer als Option", () => {
  expect(renderToStaticMarkup(ansicht())).toContain("/neu"); tippen("/PLAN");
  const html = renderToStaticMarkup(ansicht()); expect(html).toContain("/planen"); expect(html).not.toContain("/neu"); expect(html).not.toContain("/kompakt");
});
it.each(["Hallo /", "/neu ", "/neu\n"])("öffnet bei %j keine Liste", wert => {
  tippen(wert); expect(renderToStaticMarkup(ansicht())).not.toContain('role="listbox"');
});
it("wählt mit Pfeilen, führt aus und sendet bei offener Liste nicht", () => {
  taste("ArrowDown"); taste("ArrowDown"); taste("ArrowUp");
  expect(feld().props["aria-activedescendant"]).toBe("befehl-planen"); taste("Enter");
  expect(ausfuehren).toHaveBeenCalledWith("planen"); expect(senden).not.toHaveBeenCalled(); expect(text).toBe("");
});
it("schließt mit Esc, sendet danach normal und öffnet beim Tippen wieder", () => {
  expect(taste("Escape").defaultPrevented).toBe(true); expect(ansicht().props["aria-expanded"]).toBe(false);
  taste("Enter"); expect(senden).toHaveBeenCalledWith("/"); tippen("/n"); expect(ansicht().props["aria-expanded"]).toBe(true);
});
it("meldet unbekannte Befehle und sendet sie mit Enter normal", () => {
  tippen("/xyz"); expect(renderToStaticMarkup(ansicht())).toContain("Kein Befehl gefunden");
  taste("Enter"); expect(senden).toHaveBeenCalledWith("/xyz"); expect(ausfuehren).not.toHaveBeenCalled();
});
it("führt während IME oder mit Umschalt+Enter keinen Befehl aus", () => {
  taste("Enter", { nativeEvent: { isComposing: true } }); taste("Enter", { keyCode: 229 }); taste("Enter", { shiftKey: true });
  expect(ausfuehren).not.toHaveBeenCalled(); expect(senden).not.toHaveBeenCalled();
});
