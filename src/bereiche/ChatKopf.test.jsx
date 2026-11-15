import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChatVerlauf from "./ChatVerlauf";
import { BeispielQuelle } from "../daten/quelle";

const h = vi.hoisted(() => ({ werte: [], effekte: [], i: 0 }));
vi.mock("react", async original => ({ ...await original(),
  useSyncExternalStore: (_abonnieren, lesen) => lesen(),
  useState: initial => { const i = h.i++; if (!(i in h.werte)) h.werte[i] = typeof initial === "function" ? initial() : initial;
    return [h.werte[i], wert => { h.werte[i] = typeof wert === "function" ? wert(h.werte[i]) : wert; }]; },
  useEffect: fn => h.effekte.push(fn),
}));
let quelle, aufraeumen;
const kopf = () => { h.i = 0; h.effekte = []; return ChatVerlauf({ quelle }).props.children[0]; };
const html = () => renderToStaticMarkup(kopf());
const knopf = () => [kopf().props.children].flat().find(n => n?.props?.text === "Neuer Chat");
const starten = zeit => { const d = quelle.lesen(); d.chats[0].gestartetUm = zeit; quelle.aktualisieren(d); };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 15, 14, 37));
  h.werte = []; quelle = new BeispielQuelle(); aufraeumen = [];
});
afterEach(() => { aufraeumen.forEach(fn => fn?.()); vi.useRealTimers(); });

it("zeigt den festen Empfänger und ohne Start keine Laufzeit", () => {
  starten(null);
  expect(html()).toMatch(/An[^]*Orchestrator/);
  expect(html()).not.toContain("Läuft seit");
  expect(html()).not.toMatch(/<button[^]*Orchestrator/);
});
it.each([["14:30", 14, 37, "7 min"], ["23:58", 0, 3, "5 min"], ["14:37", 14, 37, "weniger als 1 min"]])(
  "zählt seit %s um %i:%i: %s", (start, stunde, minute, text) => {
    vi.setSystemTime(new Date(2026, 10, 15, stunde, minute)); starten(start);
    expect(html()).toContain(`role="status"`);
    expect(html()).toContain(`Läuft seit ${text}`);
  });
it("aktualisiert jede Minute und räumt den Timer auf", () => {
  starten("14:30"); kopf(); aufraeumen = h.effekte.map(fn => fn());
  expect(vi.getTimerCount()).toBe(1);
  const vorher = [...h.werte];
  vi.advanceTimersByTime(60_000);
  expect(h.werte).not.toEqual(vorher);
  expect(html()).toContain("Läuft seit 8 min");
  aufraeumen.forEach(fn => fn?.()); aufraeumen = [];
  expect(vi.getTimerCount()).toBe(0);
});
it("legt einen aktiven leeren Chat an und erhält den bisherigen", () => {
  const vorher = quelle.lesen().chats;
  expect(knopf().props.disabled).toBe(false); knopf().props.onClick();
  const d = quelle.lesen(); expect(d.chats).toHaveLength(vorher.length + 1);
  expect(d.chats.slice(0, -1)).toEqual(vorher);
  expect(d.chats.at(-1)).toMatchObject({ id: d.aktiverChatId, titel: "Neuer Chat", verlauf: [], gestartetUm: null, sitzung: null });
});
it("sperrt Neuer Chat während des Ladens", () => {
  quelle.aktualisieren({ ...quelle.lesen(), chats: [], aktiverChatId: null });
  expect(knopf().props.disabled).toBe(true);
});
