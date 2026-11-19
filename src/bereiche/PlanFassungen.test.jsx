import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChatVerlauf from "./ChatVerlauf";
import Planfenster from "./Planfenster";
import PlanAufwand from "./PlanAufwand";
import { Umschalter } from "../bausteine/Umschalter";
import { BeispielQuelle } from "../daten/quelle";
import { beispiel } from "../daten/beispiel";
const h = vi.hoisted(() => ({ werte: [], i: 0 }));
vi.mock("react", async original => ({ ...await original(), useEffect: () => {}, useRef: () => ({ current: null }),
  useSyncExternalStore: (_abo, lesen) => lesen(), useState: initial => {
    const i = h.i++; if (!(i in h.werte)) h.werte[i] = typeof initial === "function" ? initial() : initial;
    return [h.werte[i], wert => { h.werte[i] = typeof wert === "function" ? wert(h.werte[i]) : wert; }];
  } }));
const knoten = n => Array.isArray(n) ? n.flatMap(knoten) : n?.props ? [n, ...knoten(n.props.children)] : [];
const a = beispiel.plan, b = { ...a, id: "b", schritte: a.schritte.slice(1) };
beforeEach(() => { h.werte = []; h.i = 0; });
it("findet nur Fassungen des aktiven Verlaufs und öffnet jeweils die angeklickte", () => {
  const daten = structuredClone(beispiel), nachricht = plan => ({ id: plan.id, von: "Orchestrator", zeit: "12:00", text: "Plan", plan, aktionen: [{ id: "plan-freigeben", text: "Freigeben und bauen" }] });
  daten.chats[0].verlauf = [nachricht(a), { id: "du", von: "Du", text: "Ändern", aktionen: [] }, nachricht(b)];
  daten.chats.push({ ...daten.chats[0], id: "anderer", verlauf: [nachricht({ ...a, id: "fremd" })] });
  const quelle = new BeispielQuelle(daten);
  const ansicht = () => { h.i = 0; return knoten(ChatVerlauf({ quelle, onAktion: vi.fn() })); };
  for (const i of [0, 1]) {
    ansicht().filter(n => n.props.text === "Plan öffnen")[i].props.onClick();
    const fenster = ansicht().find(n => n.type === Planfenster);
    expect(fenster.props.fassungen).toEqual([a, b]); expect(fenster.props.fassungIndex).toBe(i);
  }
});
it("zeigt B, sperrt A mit Grund und bewahrt die Markierungen und Kommentare von B", () => {
  const props = { daten: beispiel, plan: b, fassungen: [a, b], fassungIndex: 1, gespeicherteMarken: {} };
  const ansicht = () => { h.i = 0; return knoten(Planfenster(props)); };
  const wechseln = wert => ansicht().find(n => n.type === Umschalter).props.onChange(wert);
  expect(renderToStaticMarkup(Planfenster(props))).toContain("Fassung B von 2");
  ansicht().find(n => n.props["aria-label"] === "Kommentar, Silbergrau").props.onClick();
  ansicht().find(n => n.type === "textarea").props.onChange({ target: { value: "Bitte kürzer" } });
  ansicht().find(n => n.props["aria-label"] === "Simpler, Türkis").props.onClick();
  wechseln("A");
  expect(ansicht().find(n => n.type === "ol" && n.props.className === "pl-liste").props.children).toHaveLength(a.schritte.length);
  for (const n of ansicht().filter(n => n.props.text === "Neu schreiben lassen" || n.props.text === "Freigeben und bauen" || n.props["aria-label"]?.startsWith("Mit Kommentaren zurückgeben"))) {
    expect(n.props.disabled).toBe(true); expect(n.props.grund).toBe("Ältere Fassung, nur zum Vergleich. Wechsle zur neuesten, um zu entscheiden.");
  }
  expect(ansicht().filter(n => n.props["aria-pressed"] !== undefined).every(n => n.props.disabled)).toBe(true);
  wechseln("B");
  expect(ansicht().find(n => n.type === "textarea").props.value).toBe("Bitte kürzer");
  expect(ansicht().find(n => n.props["aria-label"] === "Simpler, Türkis").props["aria-pressed"]).toBe(true);
  expect(ansicht().find(n => n.props.text === "Freigeben und bauen").props.disabled).toBe(false);
});
it("zeigt bei einer Fassung keinen zusätzlichen Kopf und keinen Umschalter", () => {
  const html = renderToStaticMarkup(Planfenster({ daten: beispiel, fassungen: [a], gespeicherteMarken: {} }));
  expect(html).not.toContain("Fassung A von"); expect(html).not.toContain('aria-label="Fassung"');
});
it.each([0, 1])("öffnet Fassung %i mit ihren Schritten und sperrt gespeicherte Kommentare in A", index => {
  const alt = { ...a, schritte: a.schritte.map(s => ({ ...s, markierungen: ["Kommentar"], kommentar: "Früherer Kommentar" })) };
  const baum = knoten(Planfenster({ daten: beispiel, plan: index ? b : alt, fassungen: [alt, b], fassungIndex: index, gespeicherteMarken: {} }));
  expect(baum.find(n => n.type === Umschalter).props.wert).toBe(index ? "B" : "A");
  expect(baum.find(n => n.type === "ol" && n.props.className === "pl-liste").props.children).toHaveLength(index ? b.schritte.length : alt.schritte.length);
  if (!index) expect(baum.filter(n => n.type === "textarea").every(n => n.props.disabled && n.props.value === "Früherer Kommentar")).toBe(true);
});
it("vergleicht Aufwand und Tokens zur vorigen Fassung, auch bei unbekannten Werten", () => {
  const schritte = [{ ...a.schritte[0], dauerMinuten: 6, tokens: 12000 }];
  const vorher = [{ ...schritte[0], dauerMinuten: 10, tokens: 0 }];
  const anzeigen = (aktuell, alt) => renderToStaticMarkup(<PlanAufwand schritte={aktuell} vorher={alt} vorherName="A" onZeigen={() => {}} />);
  expect(anzeigen(schritte, vorher)).toContain("−4 min zu A"); expect(anzeigen(schritte, vorher)).toContain("+12k zu A");
  for (const [aktuell, alt] of [[schritte, a.schritte.slice(0, 1)], [a.schritte.slice(0, 1), schritte]]) expect(anzeigen(aktuell, alt).match(/– zu A/g)).toHaveLength(2);
  expect(anzeigen(schritte, undefined)).not.toContain("zu A");
});
