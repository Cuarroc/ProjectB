import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { invoke, isTauri } from "@tauri-apps/api/core";
import ChatListe from "./ChatListe";
import { BeispielQuelle } from "../daten/quelle";
import { chatsLaden, chatsSpeichern } from "../daten/tauri";

const h = vi.hoisted(() => ({ werte: [], effekte: [], i: 0 }));
vi.mock("react", async original => ({ ...await original(),
  useState: initial => { const i = h.i++; h.werte[i] ??= typeof initial === "function" ? initial() : initial;
    return [h.werte[i], wert => { h.werte[i] = wert; }]; },
  useEffect: fn => h.effekte.push(fn),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
let quelle, aufraeumen, gespeichert;
const ansicht = () => { h.i = 0; h.effekte = []; return ChatListe({ quelle, offen: true, umschalten() {} }); };
const html = () => renderToStaticMarkup(ansicht());
const warten = () => new Promise(resolve => setTimeout(resolve, 0));
const auf = (pfad = "Projekt A") => { const d = quelle.lesen(); d.kopf = { ...d.kopf, geoeffnet: true, pfad }; quelle.aktualisieren(d); quelle.aktualisieren({ ...quelle.lesen(), rollenPfad: pfad }); };
const neu = () => { const d = quelle.lesen(); d.chats[0].titel = "Geändert"; quelle.aktualisieren(d); };
const spaeter = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const finden = (node, passt) => !node || typeof node !== "object" ? undefined : passt(node.props) ? node : [node.props?.children].flat(Infinity).map(n => finden(n, passt)).find(Boolean);
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(isTauri).mockReturnValue(true); h.werte = []; quelle = new BeispielQuelle();
  gespeichert = { aktiverChatId: quelle.lesen().aktiverChatId, chats: quelle.lesen().chats.map(c => ({ ...c, gestartetUm: null })) };
  vi.mocked(invoke).mockImplementation(async cmd => cmd === "chats_laden" ? structuredClone(gespeichert) : undefined);
  ansicht(); aufraeumen = h.effekte.map(fn => fn());
});
afterEach(() => aufraeumen.forEach(fn => fn?.()));

it("lädt erst beim Öffnen und speichert Änderungen samt aktivem Chat, keine Todos", async () => {
  expect(invoke).not.toHaveBeenCalled(); auf(); await warten();
  expect(invoke).toHaveBeenCalledExactlyOnceWith("chats_laden", { projekt: "Projekt A" });
  expect(quelle.lesen()).toMatchObject(gespeichert);
  const d = quelle.lesen(); d.todos = []; quelle.aktualisieren(d); await warten(); expect(invoke).toHaveBeenCalledTimes(1);
  neu(); await warten(); const { chats, aktiverChatId } = quelle.lesen();
  expect(invoke).toHaveBeenLastCalledWith("chats_speichern", { projekt: "Projekt A", daten: { chats, aktiverChatId } });
  const gewechselt = quelle.lesen(); gewechselt.aktiverChatId = null; quelle.aktualisieren(gewechselt); await warten();
  expect(invoke).toHaveBeenLastCalledWith("chats_speichern", { projekt: "Projekt A", daten: { chats, aktiverChatId: null } });
});
it("legt für eine leere Datei einen leeren Standard-Chat an und speichert ihn", async () => {
  gespeichert = { chats: [], aktiverChatId: null }; auf(); await warten();
  const d = quelle.lesen(); expect(d.chats).toHaveLength(1);
  expect(d.chats[0]).toMatchObject({ titel: "Neuer Chat", modus: "Ausführen", modell: "Opus 5.5", effort: "Hoch", verlauf: [], sitzung: null, gestartetUm: null, kontextProzent: 0 });
  expect(d.aktiverChatId).toBe(d.chats[0].id);
  expect(invoke).toHaveBeenLastCalledWith("chats_speichern", { projekt: "Projekt A", daten: { chats: d.chats, aktiverChatId: d.aktiverChatId } });
});
it("meldet Ladefehler und überschreibt die Datei auch nach Änderungen nie", async () => {
  vi.mocked(invoke).mockRejectedValueOnce("kaputtes JSON"); auf(); await warten();
  expect(html()).toContain("Chats konnten nicht geladen werden: kaputtes JSON. Änderungen werden nicht gespeichert.");
  expect(finden(ansicht(), p => p.text === "Neuer Chat").props.disabled).toBe(true);
  const d = quelle.lesen(); d.chats = gespeichert.chats; quelle.aktualisieren(d); neu(); await warten();
  expect(invoke).toHaveBeenCalledTimes(1);
});
it.each([{}, null, { chats: "falsch", aktiverChatId: null }, { chats: [null], aktiverChatId: null },
  ...[{ id: 1, titel: "T", verlauf: [] }, { id: "a", titel: null, verlauf: [] }, { id: "a", titel: "T", verlauf: {} }].map(chat => ({ chats: [chat], aktiverChatId: null }))])("behandelt unbrauchbare Dateiinhalte %j als Ladefehler ohne Speichern", async inhalt => {
  vi.mocked(invoke).mockResolvedValueOnce(inhalt); auf(); await warten();
  expect(html()).toContain("Chats konnten nicht geladen werden: Ungültiges Chat-Format. Änderungen werden nicht gespeichert.");
  const d = quelle.lesen(); d.chats = gespeichert.chats; quelle.aktualisieren(d); neu(); await warten();
  expect(invoke).toHaveBeenCalledTimes(1);
});
it("zeigt einen Speicherfehler dauerhaft und kann danach erneut speichern", async () => {
  auf(); await warten(); vi.mocked(invoke).mockRejectedValueOnce("Chats konnten nicht gespeichert werden: größer als 20 MB"); neu(); await warten();
  expect(html()).toContain("Chats konnten nicht gespeichert werden: größer als 20 MB");
  const d = quelle.lesen(); d.chats[0].titel = "Kleiner"; quelle.aktualisieren(d); await warten();
  expect(html()).not.toContain("Chats konnten nicht gespeichert werden:");
});
it("legt mit dem Knopf einen eigenen aktiven Chat an und behält den alten Verlauf", async () => {
  auf(); await warten();
  finden(ansicht(), p => p.text === "Neuer Chat").props.onClick(); await warten(); const d = quelle.lesen();
  expect(d.chats).toHaveLength(2); expect(d.chats[0]).toEqual(gespeichert.chats[0]);
  expect(d.aktiverChatId).toBe(d.chats[1].id); expect(d.chats[1]).toMatchObject({ titel: "Neuer Chat", verlauf: [], sitzung: null });
  expect(html()).toContain('aria-current="true"');
});
it("sperrt Neuer Chat bis zum erfolgreichen Laden", async () => {
  const offen = spaeter(); vi.mocked(invoke).mockReturnValueOnce(offen.promise); auf(); await warten();
  expect(html()).toMatch(/disabled=""[^>]*>[^]*?Neuer Chat/); expect(quelle.lesen().chats).toEqual([]);
  offen.resolve(gespeichert); await warten();
  expect(finden(ansicht(), p => p.text === "Neuer Chat").props.disabled).toBe(false);
});
it("behält eine unmittelbar vor dem Chatwechsel eintreffende Antwort", async () => {
  auf(); await warten(); const wechsel = finden(ansicht(), p => p.className === "rand-chat").props.onClick;
  const d = quelle.lesen(); d.chats[0].verlauf.push({ id: "spaet", von: "Orchestrator", text: "Antwort", zeit: "12:00", aktionen: [] });
  quelle.aktualisieren(d); wechsel(); await warten();
  expect(quelle.lesen().chats[0].verlauf.at(-1).text).toBe("Antwort");
});
it("lädt beim Projektwechsel und ignoriert ein verspätetes Ladeergebnis", async () => {
  const alt = spaeter(), aktuell = spaeter(); vi.mocked(invoke).mockReturnValueOnce(alt.promise).mockReturnValueOnce(aktuell.promise);
  auf(); await warten(); auf("Projekt B"); await warten();
  expect(invoke).toHaveBeenLastCalledWith("chats_laden", { projekt: "Projekt B" });
  aktuell.resolve({ chats: [{ ...gespeichert.chats[0], id: "b", titel: "B" }], aktiverChatId: "b" }); await warten();
  alt.resolve(gespeichert); await warten(); expect(quelle.lesen().aktiverChatId).toBe("b");
  neu(); await warten(); expect(invoke).toHaveBeenLastCalledWith("chats_speichern", expect.objectContaining({ projekt: "Projekt B" }));
});
it("speichert nacheinander und wartet beim Zurückwechseln auf offene Schreibvorgänge", async () => {
  auf(); await warten(); const offen = spaeter(); vi.mocked(invoke).mockReturnValueOnce(offen.promise);
  neu(); await warten(); const d = quelle.lesen(); d.chats[0].titel = "Letzter Stand"; quelle.aktualisieren(d); await warten();
  expect(invoke).toHaveBeenCalledTimes(2); auf("Projekt B"); await warten(); auf(); await warten();
  expect(invoke).toHaveBeenCalledTimes(3); offen.resolve(); await warten();
  expect(invoke.mock.calls.slice(3).map(([cmd, args]) => [cmd, args.projekt])).toEqual([["chats_speichern", "Projekt A"], ["chats_laden", "Projekt A"]]);
});
it("tut ohne Tauri nichts und behält die Beispieldaten", async () => {
  aufraeumen.forEach(fn => fn?.()); vi.mocked(isTauri).mockReturnValue(false); ansicht(); aufraeumen = h.effekte.map(fn => fn());
  const vorher = structuredClone(quelle.lesen().chats); auf(); await warten(); expect(quelle.lesen().chats).toEqual(vorher);
  expect(await chatsLaden("A")).toBeUndefined(); await chatsSpeichern("A", gespeichert); expect(invoke).not.toHaveBeenCalled();
});
it("setzt gestartetUm beim Laden zurück, damit kein alter Lauf den Projektwechsel sperrt", async () => {
  gespeichert = { ...gespeichert, chats: gespeichert.chats.map(c => ({ ...c, gestartetUm: "12:00" })) }; auf(); await warten();
  expect(quelle.lesen().chats.every(c => c.gestartetUm === null)).toBe(true);
});
it("wendet nach dem Abmelden kein Ladeergebnis mehr an", async () => {
  const offen = spaeter(); vi.mocked(invoke).mockReturnValueOnce(offen.promise); auf(); await warten();
  aufraeumen.forEach(fn => fn?.()); const vorher = quelle.lesen(); offen.resolve(gespeichert); await warten();
  expect(quelle.lesen()).toEqual(vorher); expect(invoke).toHaveBeenCalledTimes(1);
});

it("erhält die Zusammenfassung beim Speichern und erneuten Laden", async () => {
  auf(); await warten(); const d = quelle.lesen(); d.chats[0].zusammenfassung = d.chats[0].verlauf.at(-1).id;
  quelle.aktualisieren(d); await warten(); gespeichert = JSON.parse(JSON.stringify(invoke.mock.calls.at(-1)[1].daten));
  auf("Projekt B"); await warten(); auf(); await warten();
  expect(quelle.lesen().chats[0].zusammenfassung).toBe(d.chats[0].zusammenfassung);
});
