import { beforeEach, expect, it, vi } from "vitest";
import { Children, isValidElement } from "react";
import { Einstellungen } from "./Einstellungen";
import { Umschalter } from "../../bausteine/Umschalter";

const h = vi.hoisted(() => ({ werte: [], refs: [], layout: [], i: 0, r: 0, fokus: vi.fn() }));
vi.mock("react", async original => ({ ...await original(), useId: () => "einstellungen", useEffect: () => {},
  useState: initial => { const i = h.i++; if (!(i in h.werte)) h.werte[i] = initial;
    return [h.werte[i], neu => { h.werte[i] = typeof neu === "function" ? neu(h.werte[i]) : neu; }]; },
  useRef: initial => h.refs[h.r++] ?? (h.refs[h.r - 1] = { current: initial === null ? { focus: h.fokus, querySelector: () => ({ focus: h.fokus }) } : initial }),
  useLayoutEffect: fn => h.layout.push(fn),
}));
beforeEach(() => { h.werte = []; h.refs = []; h.fokus.mockClear(); });
function ansicht(modus = "Ausführen") {
  h.i = 0; h.r = 0; h.layout = [];
  const el = Einstellungen({ modus }); h.layout.forEach(fn => fn()); return el;
}
function finde(el, passt) {
  if (!isValidElement(el)) return;
  if (passt(el)) return el;
  return Children.toArray(el.props.children).map(kind => finde(kind, passt)).find(Boolean);
}
const knopf = el => finde(el, e => e.type === "button" && e.props["aria-haspopup"]);
const menue = el => finde(el, e => e.props.role === "dialog");
const text = el => Children.toArray(el?.props.children).filter(x => typeof x === "string").join("");
const status = el => text(finde(knopf(el), e => e.props.className === "einst-wort"));
const reset = el => finde(el, e => e.type === "button" && text(e) === "Auf Empfohlen zurücksetzen");

it("hat bei Interview keinen Knopf und bei Planen die empfohlenen Werte", () => {
  expect(ansicht("Interview")).toBeNull();
  knopf(ansicht("Planen")).props.onClick(); const el = ansicht("Planen");
  expect(menue(el).props["aria-label"]).toBe("Einstellungen für Planen");
  expect(finde(el, e => e.type === Umschalter).props.wert).toBe("Normal");
});
it("zeigt Angepasst nach Änderung und Empfohlen nach Zurücksetzen, getrennt je Modus", () => {
  knopf(ansicht()).props.onClick(); let el = ansicht();
  expect(status(el)).toBe("Empfohlen"); expect(reset(el).props.disabled).toBe(true);
  finde(el, e => e.type === Umschalter).props.onChange("Bis zu 5"); el = ansicht();
  expect(status(el)).toBe("Angepasst"); expect(reset(el).props.disabled).toBe(false);
  expect(status(ansicht("Planen"))).toBe("Empfohlen");
  expect(status(ansicht())).toBe("Angepasst");
  reset(ansicht()).props.onClick(); el = ansicht();
  expect(status(el)).toBe("Empfohlen"); expect(reset(el).props.disabled).toBe(true);
});
it.each(["Escape", "Tab"])("%s schließt und gibt den Fokus zurück", key => {
  knopf(ansicht()).props.onClick(); const el = ansicht();
  menue(el).props.onKeyDownCapture({ key, preventDefault: vi.fn(), stopPropagation: vi.fn() });
  expect(menue(ansicht())).toBeUndefined(); expect(h.fokus).toHaveBeenCalled();
});
