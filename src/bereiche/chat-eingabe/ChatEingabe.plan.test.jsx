import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BeispielQuelle } from "../../daten/quelle";
import { auftragSenden, chatNachrichtenHoeren } from "../../daten/tauri";
import { useChatEingabe } from "../ChatEingabe";

const h = vi.hoisted(() => ({ werte: [], refs: [], effekte: [], i: 0, r: 0 }));
vi.mock("react", async original => ({ ...await original(),
  useState: initial => { const i = h.i++; if (!(i in h.werte)) h.werte[i] = typeof initial === "function" ? initial() : initial;
    return [h.werte[i], wert => { h.werte[i] = wert; }]; },
  useRef: initial => h.refs[h.r++] ??= { current: initial }, useEffect: fn => h.effekte.push(fn),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("../../daten/tauri", () => ({ auftragSenden: vi.fn(), chatNachrichtenHoeren: vi.fn() }));
let quelle, empfangen, aufraeumen, beenden;
const ansicht = () => { h.i = 0; h.r = 0; h.effekte = []; return useChatEingabe(quelle); };
const chat = () => quelle.lesen().chats[0];
const aendern = werte => { const d = quelle.lesen(); Object.assign(d.chats[0], werte); quelle.aktualisieren(d); };
const plan = async () => { const lauf = ansicht().senden("Plane"); await Promise.resolve();
  empfangen(chat().id, "Mein Plan"); beenden({ sitzung: { id: "s-plan", anbieter: "Claude", pfad: quelle.lesen().kopf.pfad }, erfolg: true }); await lauf; };
beforeEach(() => {
  h.werte = []; h.refs = []; quelle = new BeispielQuelle();
  const d = quelle.lesen(); d.kopf.geoeffnet = true; d.chats[0].modus = "Planen"; d.chats[0].gestartetUm = null; quelle.aktualisieren(d);
  vi.mocked(chatNachrichtenHoeren).mockImplementation(async cb => { empfangen = cb; return () => {}; });
  vi.mocked(auftragSenden).mockImplementation(() => new Promise(resolve => { beenden = resolve; }));
  ansicht(); aufraeumen = h.effekte.map(fn => fn());
});
afterEach(() => { aufraeumen.forEach(fn => fn?.()); vi.resetAllMocks(); vi.unstubAllGlobals(); });
it.each([["Planen", true, 2], ["Ausführen", true, 0], ["Interview", true, 0], ["Planen", false, 0], ["Planen", "Fehler", 0]])(
  "%s mit Ergebnis %s: nur die letzte Antwort dieses Laufs erhält %s Aktionen", async (modus, erfolg, anzahl) => {
    aendern({ modus }); const lauf = ansicht().senden("Auftrag"); await Promise.resolve();
    empfangen(chat().id, "Zwischenstand"); empfangen(chat().id, "Plan fertig");
    if (erfolg === "Fehler") { beenden(Promise.reject(new Error("kaputt"))); } else beenden({ sitzung: null, erfolg });
    await lauf; expect(chat().verlauf.at(-2).aktionen).toEqual([]);
    expect(chat().verlauf.at(-1).aktionen).toHaveLength(anzahl);
    if (anzahl) expect(chat().verlauf.at(-1).aktionen.map(a => a.text)).toEqual(["Freigeben und bauen", "Mit Kommentaren zurückgeben"]);
  });
it("hängt ohne neue Antwort keine Knöpfe an eine alte Nachricht", async () => {
  const lauf = ansicht().senden("Plane"); await Promise.resolve(); beenden({ sitzung: null, erfolg: true }); await lauf;
  expect(chat().verlauf.every(n => n.aktionen.length === 0)).toBe(true);
});
it("gibt frei, setzt die Sitzung über denselben Sendeweg fort und verhindert Doppelklicks", async () => {
  await plan(); const n = chat().verlauf.at(-1), aktion = ansicht().onAktion;
  const lauf = aktion(n.id, n.aktionen[0].id); await aktion(n.id, n.aktionen[0].id); await Promise.resolve();
  expect(chat().modus).toBe("Ausführen"); expect(chat().verlauf.find(v => v.id === n.id).aktionen).toEqual([]);
  expect(auftragSenden).toHaveBeenCalledTimes(2);
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ modus: "Ausführen", text: "Der Plan ist freigegeben. Setze ihn jetzt um.", sitzung: { id: "s-plan", anbieter: "Claude", pfad: quelle.lesen().kopf.pfad } }));
  beenden({ sitzung: null, erfolg: true }); await lauf;
});
it("setzt Kommentare und Fokus, leert beide Knöpfe und bleibt in Planen", async () => {
  await plan(); const n = chat().verlauf.at(-1), focus = vi.fn(); vi.stubGlobal("document", { getElementById: () => ({ focus }) });
  await ansicht().onAktion(n.id, n.aktionen[1].id);
  expect(chat().modus).toBe("Planen"); expect(ansicht().text).toBe("Kommentare zum Plan: "); expect(focus).toHaveBeenCalledOnce();
  expect(chat().verlauf.at(-1).aktionen).toEqual([]); expect(auftragSenden).toHaveBeenCalledOnce();
});
it("sperrt Aktionen während eines Laufs und Freigabe ohne Projekt, auch bei geladenen Knöpfen", async () => {
  await plan(); const n = chat().verlauf.at(-1); quelle = new BeispielQuelle(quelle.lesen());
  const d = quelle.lesen(); d.kopf.geoeffnet = false; quelle.aktualisieren(d);
  await ansicht().onAktion(n.id, n.aktionen[0].id); expect(chat().verlauf.at(-1).aktionen).toHaveLength(2);
  expect(chat().modus).toBe("Planen"); d.kopf.geoeffnet = true; quelle.aktualisieren(d);
  const lauf = ansicht().senden("Weitere Frage"); await Promise.resolve();
  await ansicht().onAktion(n.id, n.aktionen[1].id); await ansicht().onAktion(n.id, n.aktionen[0].id);
  expect(chat().verlauf.find(v => v.id === n.id).aktionen).toHaveLength(2); expect(auftragSenden).toHaveBeenCalledTimes(2);
  beenden({ sitzung: null, erfolg: false }); await lauf;
});
