import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isTauri } from "@tauri-apps/api/core";
import { BeispielQuelle } from "../../daten/quelle";
import { auftragSenden, chatNachrichtenHoeren } from "../../daten/tauri";
import ChatEingabe from "../ChatEingabe";

const h = vi.hoisted(() => ({ werte: [], refs: [], effekte: [], i: 0, r: 0 }));
vi.mock("react", async original => ({ ...await original(),
  useState: initial => { const i = h.i++; if (!(i in h.werte)) h.werte[i] = typeof initial === "function" ? initial() : initial;
    return [h.werte[i], wert => { h.werte[i] = wert; }]; },
  useRef: initial => h.refs[h.r++] ??= { current: initial },
  useEffect: fn => h.effekte.push(fn),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => true) }));
vi.mock("../../daten/tauri", () => ({ auftragSenden: vi.fn(), chatNachrichtenHoeren: vi.fn() }));
let quelle, empfangen, abmelden, aufraeumen;
const ansicht = () => { h.i = 0; h.r = 0; h.effekte = []; return ChatEingabe({ quelle }); };
const chat = () => quelle.lesen().chats[0];
beforeEach(() => {
  h.werte = []; h.refs = []; quelle = new BeispielQuelle(); abmelden = vi.fn();
  const daten = quelle.lesen(); daten.kopf.geoeffnet = true; quelle.aktualisieren(daten);
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(chatNachrichtenHoeren).mockImplementation(async cb => { empfangen = cb; return abmelden; });
  ansicht(); aufraeumen = h.effekte.map(fn => fn());
});
afterEach(async () => { aufraeumen.forEach(fn => fn?.()); await Promise.resolve(); vi.resetAllMocks(); });

it.each(["Opus 5.5", "gPt-6", "mein cOdEx"])("sendet %s, sperrt Doppelsenden und setzt die Sitzung fort", async modell => {
  const daten = quelle.lesen(); daten.chats[0].modell = modell; quelle.aktualisieren(daten);
  let beenden; vi.mocked(auftragSenden).mockReturnValueOnce(new Promise(resolve => { beenden = resolve; }));
  const vorher = chat().verlauf.length, erste = ansicht().props.senden("Baue den Export");
  await Promise.resolve(); await Promise.resolve();
  expect(chat().verlauf.at(-1)).toMatchObject({ von: "Du", text: "Baue den Export" });
  expect(auftragSenden).toHaveBeenCalledExactlyOnceWith({ chat: chat().id, pfad: daten.kopf.pfad,
    anbieter: modell === "Opus 5.5" ? "Claude" : "Codex", sitzung: null, text: "Baue den Export" });
  expect(chat().gestartetUm).toMatch(/^\d\d:\d\d$/);
  await ansicht().props.senden("Noch einmal");
  expect(auftragSenden).toHaveBeenCalledOnce(); expect(chat().verlauf).toHaveLength(vorher + 1);
  expect(ansicht().props.fehler).toContain("läuft bereits");
  beenden({ sitzung: "sitzung-1", erfolg: true }); await erste;
  expect(chat()).toMatchObject({ sitzung: { id: "sitzung-1", anbieter: modell === "Opus 5.5" ? "Claude" : "Codex", pfad: daten.kopf.pfad }, gestartetUm: null });
  vi.mocked(auftragSenden).mockResolvedValueOnce({ sitzung: "sitzung-1", erfolg: false });
  await ansicht().props.senden("Weiter");
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ sitzung: "sitzung-1", text: "Weiter" }));
});
it("startet ohne bestätigtes Projekt nichts und behält Text und Verlauf", async () => {
  const daten = quelle.lesen(); delete daten.kopf.geoeffnet; quelle.aktualisieren(daten);
  ansicht().props.schreiben("Baue den Export");
  await ansicht().props.senden("Baue den Export");
  expect(auftragSenden).not.toHaveBeenCalled(); expect(chat().verlauf).toEqual(daten.chats[0].verlauf);
  expect(ansicht().props.fehler).toBe("Bitte zuerst oben ein Projekt öffnen.");
  expect(ansicht().props.text).toBe("Baue den Export");
});
it.each(["Modell", "Projekt"])("setzt nach einem Wechsel von %s die Sitzung nicht fort", async wechsel => {
  let beenden; vi.mocked(auftragSenden).mockReturnValueOnce(new Promise(resolve => { beenden = resolve; }));
  const erster = ansicht().props.senden("Baue"); await Promise.resolve();
  const daten = quelle.lesen(), pfad = daten.kopf.pfad;
  if (wechsel === "Modell") daten.chats[0].modell = "GPT-6";
  else daten.kopf.pfad = "D:\\AnderesProjekt";
  quelle.aktualisieren(daten); beenden({ sitzung: "alte-sitzung", erfolg: true }); await erster;
  expect(chat().sitzung).toEqual({ id: "alte-sitzung", anbieter: "Claude", pfad });
  vi.mocked(auftragSenden).mockResolvedValueOnce({ sitzung: "neue-sitzung", erfolg: true });
  await ansicht().props.senden("Weiter");
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({
    anbieter: wechsel === "Modell" ? "Codex" : "Claude", pfad: daten.kopf.pfad, sitzung: null,
  }));
});
it("ordnet Events auch einem inaktiven Chat zu und ignoriert unbekannte Chats", () => {
  const daten = quelle.lesen(); daten.chats.push({ ...chat(), id: "anderer", verlauf: [] }); quelle.aktualisieren(daten);
  empfangen("anderer", "Ich prüfe das."); empfangen("unbekannt", "Ignorieren");
  expect(quelle.lesen().chats[1].verlauf).toEqual([expect.objectContaining({ von: "Orchestrator", text: "Ich prüfe das.", zeit: expect.any(String), aktionen: [] })]);
  expect(chat().verlauf).toEqual(daten.chats[0].verlauf);
});
it.each([new Error("Start fehlgeschlagen"), "Start fehlgeschlagen"])("meldet Startfehler und gibt den Chat wieder frei: %s", async fehler => {
  vi.mocked(auftragSenden).mockRejectedValueOnce(fehler);
  await ansicht().props.senden("Baue");
  expect(chat().verlauf.at(-1)).toMatchObject({ von: "Orchestrator", text: "Problem: Start fehlgeschlagen" });
  expect(chat().gestartetUm).toBeNull();
});
it("legt im Browser nur die Nachricht ab", async () => {
  vi.mocked(isTauri).mockReturnValue(false);
  await ansicht().props.senden("Beispiel");
  expect(chat().verlauf.at(-1)).toMatchObject({ von: "Du", text: "Beispiel" });
  expect(chat().gestartetUm).toBe("14:30"); expect(auftragSenden).not.toHaveBeenCalled();
});
it("meldet einen erst nach dem Unmount bereitstehenden Listener ab", async () => {
  aufraeumen.forEach(fn => fn?.()); await Promise.resolve();
  expect(abmelden).toHaveBeenCalledOnce(); aufraeumen = [];
});

it("lässt einen anderen Chat senden und ordnet späte Ergebnisse dem ursprünglichen Chat zu", async () => {
  let beenden; vi.mocked(auftragSenden).mockReturnValueOnce(new Promise(resolve => { beenden = resolve; }));
  const erster = ansicht().props.senden("Erster Chat"); await Promise.resolve();
  const daten = quelle.lesen(); daten.chats.push({ ...chat(), id: "zweiter", verlauf: [], gestartetUm: null });
  daten.aktiverChatId = "zweiter"; quelle.aktualisieren(daten);
  vi.mocked(auftragSenden).mockResolvedValueOnce({ sitzung: "s-2", erfolg: true });
  await ansicht().props.senden("Zweiter Chat");
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ chat: "zweiter", sitzung: null }));
  empfangen(chat().id, "Späte Antwort"); beenden({ sitzung: "s-1", erfolg: true }); await erster;
  expect(chat()).toMatchObject({ sitzung: { id: "s-1" }, gestartetUm: null });
  expect(chat().verlauf.at(-1).text).toBe("Späte Antwort");
  expect(quelle.lesen().chats[1]).toMatchObject({ sitzung: { id: "s-2" }, gestartetUm: null });
});
