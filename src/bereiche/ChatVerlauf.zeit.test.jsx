import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChatVerlauf from "./ChatVerlauf";
import { BeispielQuelle } from "../daten/quelle";
const h = vi.hoisted(() => ({ effekte: [], setzen: vi.fn() }));
vi.mock("react", async original => ({ ...await original(), useEffect: fn => h.effekte.push(fn),
  useState: initial => [typeof initial === "function" ? initial() : initial, h.setzen] }));
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
