import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChatVerlauf from "./ChatVerlauf";
import { BeispielQuelle } from "../daten/quelle";
const h = vi.hoisted(() => ({ effekte: [], setzen: vi.fn() }));
vi.mock("react", async original => ({ ...await original(), useEffect: fn => h.effekte.push(fn),
  useState: initial => [typeof initial === "function" ? initial() : initial, h.setzen] }));
it.each([[59, "59 min"], [60, "1 h"], [1021, "17 h 1 min"]])("zeigt %s Minuten als %s", (minuten, erwartet) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 18, 23, 0));
  try {
    const quelle = new BeispielQuelle(), daten = quelle.lesen(), start = new Date(Date.now() - minuten * 60000);
    daten.chats[0].gestartetUm = `${start.getHours()}:${start.getMinutes()}`; quelle.aktualisieren(daten);
    expect(renderToStaticMarkup(<ChatVerlauf quelle={quelle} />)).toContain(`Läuft seit ${erwartet}`);
  } finally { h.effekte = []; vi.useRealTimers(); }
});
it("aktualisiert an der vollen Minute und räumt beim Schließen auf", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-16T12:34:54.250Z"));
  const quelle = new BeispielQuelle(), daten = quelle.lesen(); daten.chats[0].gestartetUm = "12:34"; quelle.aktualisieren(daten);
  let aufraeumen = [];
  try {
    renderToStaticMarkup(<ChatVerlauf quelle={quelle} />); aufraeumen = h.effekte.map(fn => fn()); h.setzen.mockClear();
    vi.advanceTimersByTime(5749); expect(h.setzen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(h.setzen).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60000); expect(h.setzen).toHaveBeenCalledTimes(2);
  } finally { aufraeumen.forEach(fn => fn?.()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); }
});
