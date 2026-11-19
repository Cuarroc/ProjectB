import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTauri } from "@tauri-apps/api/core";
import { BeispielQuelle } from "../../daten/quelle";
import { auftragSenden, chatNachrichtenHoeren, projektDateien } from "../../daten/tauri";
import ChatEingabe from "../ChatEingabe";

const h = vi.hoisted(() => ({ werte: [], refs: [], effekte: [], i: 0, r: 0 }));
vi.mock("react", async original => ({ ...await original(),
  useState: initial => { const i = h.i++; if (!(i in h.werte)) h.werte[i] = typeof initial === "function" ? initial() : initial;
    return [h.werte[i], wert => { h.werte[i] = wert; }]; },
  useRef: initial => h.refs[h.r++] ??= { current: initial },
  useEffect: fn => h.effekte.push(fn),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => true) }));
vi.mock("../../daten/tauri", () => ({ auftragSenden: vi.fn(), chatNachrichtenHoeren: vi.fn(), projektDateien: vi.fn() }));
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

it.each([["Opus 5.5", "Niedrig"], ["gpt-6.1-sol", "Sehr hoch"]])("sendet %s mit %s, sperrt Doppelsenden und reicht die Sitzung weiter", async (modell, effort) => {
  const daten = quelle.lesen(); daten.chats[0].modell = modell; daten.chats[0].effort = effort; quelle.aktualisieren(daten);
  let beenden; vi.mocked(auftragSenden).mockReturnValueOnce(new Promise(resolve => { beenden = resolve; }));
  const vorher = chat().verlauf.length, erste = ansicht().props.senden("Baue den Export");
  await Promise.resolve(); await Promise.resolve();
  expect(chat().verlauf.at(-1)).toMatchObject({ von: "Du", text: "Baue den Export" });
  expect(auftragSenden).toHaveBeenCalledExactlyOnceWith({ chat: chat().id, pfad: daten.kopf.pfad,
    modell, effort, modus: "Ausführen", sitzung: null,
    text: `Bisheriger Verlauf dieses Chats (zur Einordnung):\n\n${daten.chats[0].verlauf.map(n => `${n.von}: ${n.text}`).join("\n\n")}\n\nNeue Nachricht:\nBaue den Export` });
  expect(chat().gestartetUm).toMatch(/^\d\d:\d\d$/);
  await ansicht().props.senden("Noch einmal");
  expect(auftragSenden).toHaveBeenCalledOnce(); expect(chat().verlauf).toHaveLength(vorher + 1);
  expect(ansicht().props.fehler).toContain("läuft bereits");
  const sitzung = { id: "sitzung-1", anbieter: modell === "Opus 5.5" ? "Claude" : "Codex", pfad: daten.kopf.pfad };
  beenden({ sitzung, erfolg: true }); await erste;
  expect(chat()).toMatchObject({ sitzung, gestartetUm: null });
  vi.mocked(auftragSenden).mockResolvedValueOnce({ sitzung: null, erfolg: false });
  await ansicht().props.senden("Weiter");
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ sitzung, text: "Weiter" }));
  expect(chat().sitzung).toBeNull();
});
it("startet ohne bestätigtes Projekt nichts und behält Text und Verlauf", async () => {
  const daten = quelle.lesen(); delete daten.kopf.geoeffnet; quelle.aktualisieren(daten);
  ansicht().props.schreiben("Baue den Export");
  await ansicht().props.senden("Baue den Export");
  expect(auftragSenden).not.toHaveBeenCalled(); expect(chat().verlauf).toEqual(daten.chats[0].verlauf);
  expect(ansicht().props.fehler).toBe("Bitte zuerst oben ein Projekt öffnen.");
  expect(ansicht().props.text).toBe("Baue den Export");
});
it.each(["Modell", "Projekt"])("reicht nach einem Wechsel von %s die Sitzung unverändert an den Kern weiter", async wechsel => {
  let beenden; vi.mocked(auftragSenden).mockReturnValueOnce(new Promise(resolve => { beenden = resolve; }));
  const erster = ansicht().props.senden("Baue"); await Promise.resolve();
  const daten = quelle.lesen(), pfad = daten.kopf.pfad;
  if (wechsel === "Modell") daten.chats[0].modell = "gpt-6.1-sol";
  else daten.kopf.pfad = "D:\\AnderesProjekt";
  const sitzung = { id: "alte-sitzung", anbieter: "Claude", pfad };
  quelle.aktualisieren(daten); beenden({ sitzung, erfolg: true }); await erster;
  expect(chat().sitzung).toEqual({ id: "alte-sitzung", anbieter: "Claude", pfad });
  vi.mocked(auftragSenden).mockResolvedValueOnce({ sitzung: null, erfolg: true });
  await ansicht().props.senden("Weiter");
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({
    modell: daten.chats[0].modell, effort: daten.chats[0].effort, pfad: daten.kopf.pfad, sitzung,
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
it("hängt Dateibezüge nur an den Auftrag an, Agenten bleiben Text", async () => {
  vi.mocked(projektDateien).mockResolvedValue(["src/export/csv.rs"]);
  vi.mocked(auftragSenden).mockResolvedValue({ sitzung: null, erfolg: true });
  const text = "Prüfe @src/export/csv.rs mit @CSV-Export im Kern"; await ansicht().props.senden(text);
  expect(auftragSenden.mock.calls[0][0].text).toMatch(/Bezüge:\n- src\/export\/csv.rs$/);
  expect(chat().verlauf.at(-1).text).toBe(text);
});
it("sperrt Doppelsenden bereits beim Laden der Dateiliste", async () => {
  let laden; vi.mocked(projektDateien).mockReturnValue(new Promise(resolve => { laden = resolve; }));
  vi.mocked(auftragSenden).mockResolvedValue({ sitzung: null, erfolg: true });
  const erstes = ansicht().props.senden("@src/export/csv.rs"); await ansicht().props.senden("Zweiter Auftrag");
  expect(auftragSenden).not.toHaveBeenCalled(); laden(["src/export/csv.rs"]); await erstes; expect(auftragSenden).toHaveBeenCalledOnce();
});
it("meldet einen erst nach dem Unmount bereitstehenden Listener ab", async () => {
  aufraeumen.forEach(fn => fn?.()); await Promise.resolve();
  expect(abmelden).toHaveBeenCalledOnce(); aufraeumen = [];
});
it("ignoriert den Abschluss eines beim Projektwechsel entfernten Chats", async () => {
  let beenden; vi.mocked(auftragSenden).mockReturnValueOnce(new Promise(resolve => { beenden = resolve; }));
  const laufend = ansicht().props.senden("Baue"); await Promise.resolve();
  const d = quelle.lesen(); d.chats = []; d.aktiverChatId = null; quelle.aktualisieren(d);
  beenden({ sitzung: null, erfolg: true }); await expect(laufend).resolves.toBeUndefined();
  expect(quelle.lesen().chats).toEqual([]);
});

it("lässt einen anderen Chat senden und ordnet späte Ergebnisse dem ursprünglichen Chat zu", async () => {
  let beenden; vi.mocked(auftragSenden).mockReturnValueOnce(new Promise(resolve => { beenden = resolve; }));
  const erster = ansicht().props.senden("Erster Chat"); await Promise.resolve();
  const daten = quelle.lesen(); daten.chats.push({ ...chat(), id: "zweiter", verlauf: [], gestartetUm: null });
  daten.aktiverChatId = "zweiter"; quelle.aktualisieren(daten);
  vi.mocked(auftragSenden).mockResolvedValueOnce({ sitzung: { id: "s-2", anbieter: "Claude", pfad: daten.kopf.pfad }, erfolg: true });
  await ansicht().props.senden("Zweiter Chat");
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ chat: "zweiter", sitzung: null }));
  empfangen(chat().id, "Späte Antwort"); beenden({ sitzung: { id: "s-1", anbieter: "Claude", pfad: daten.kopf.pfad }, erfolg: true }); await erster;
  expect(chat()).toMatchObject({ sitzung: { id: "s-1" }, gestartetUm: null });
  expect(chat().verlauf.at(-1).text).toBe("Späte Antwort");
  expect(quelle.lesen().chats[1]).toMatchObject({ sitzung: { id: "s-2" }, gestartetUm: null });
});

it.each(["Ausführen", "Planen", "Interview"])("sendet den aktuellen Modus %s auch beim Fortsetzen", async modus => {
  const daten = quelle.lesen(); daten.chats[0].modus = modus; quelle.aktualisieren(daten);
  const sitzung = { id: "s-modus", anbieter: "Claude", pfad: daten.kopf.pfad };
  vi.mocked(auftragSenden).mockResolvedValue({ sitzung, erfolg: true });
  await ansicht().props.senden("Auftrag");
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ modus, sitzung: null }));
  await ansicht().props.senden("Weiter");
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ modus, sitzung }));
});

it.each(["Ausführen", "Planen", "Interview"])("übergibt bei Anbieterwechsel in %s den Verlauf, zeigt aber nur den neuen Text", async modus => {
  const d = quelle.lesen(); Object.assign(d.chats[0], { modus, modell: "gpt-6.1-sol",
    sitzung: { id: "alt", anbieter: "Claude", pfad: d.kopf.pfad }, verlauf: [
      { id: "1", von: "Du", text: "Plane den Export.", aktionen: [] },
      { id: "2", von: "Orchestrator", text: "Mein Exportplan", aktionen: [] },
    ] }); quelle.aktualisieren(d);
  vi.mocked(auftragSenden).mockResolvedValue({ sitzung: null, erfolg: true });
  await ansicht().props.senden("Kommentare zum Plan: Umlaute");
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ modus,
    text: "Bisheriger Verlauf dieses Chats (zur Einordnung):\n\nDu: Plane den Export.\n\nOrchestrator: Mein Exportplan\n\nNeue Nachricht:\nKommentare zum Plan: Umlaute" }));
  expect(chat().verlauf.at(-1)).toMatchObject({ von: "Du", text: "Kommentare zum Plan: Umlaute" });
  expect(chat().verlauf).toHaveLength(3);
});
it.each([
  ["Opus 5.5", "Codex", false, true], ["Sonnet 5.5", "Claude", false, false],
  ["Haiku 5.5", "Claude", false, false], ["gpt-6.1-sol", "Codex", false, false],
  ["Opus 5.5", "Claude", true, true], ["Opus 5.5", null, false, true],
])("prüft Modell %s, Sitzung %s und Pfadwechsel %s", async (modell, anbieter, andererPfad, kontext) => {
  const d = quelle.lesen(); Object.assign(d.chats[0], { modell,
    sitzung: anbieter ? { id: "alt", anbieter, pfad: andererPfad ? "D:\\Anderes" : d.kopf.pfad } : null });
  quelle.aktualisieren(d); vi.mocked(auftragSenden).mockResolvedValue({ sitzung: null, erfolg: true });
  await ansicht().props.senden("Weiter");
  const gesendet = vi.mocked(auftragSenden).mock.calls.at(-1)[0].text;
  if (kontext) { expect(gesendet).toContain(`Du: ${d.chats[0].verlauf[0].text}`); expect(gesendet.endsWith("Neue Nachricht:\nWeiter")).toBe(true); }
  else expect(gesendet).toBe("Weiter");
});
it.each([
  ["Anzahl", Array.from({ length: 22 }, (_, i) => `Nachricht ${i}`), 20],
  ["Zeichen", ["A".repeat(9000), "B".repeat(9000), "C".repeat(9000)], 2],
  ["überlange Einzelnachricht", ["A".repeat(20001)], 0],
])("kürzt den Kontext nach %s von vorne mit Hinweis", async (_fall, texte, anzahl) => {
  const d = quelle.lesen(); d.chats[0].verlauf = texte.map((text, i) => ({ id: String(i), von: "Du", text, aktionen: [] }));
  quelle.aktualisieren(d); vi.mocked(auftragSenden).mockResolvedValue({ sitzung: null, erfolg: true });
  await ansicht().props.senden("Neue Bitte");
  const gesendet = vi.mocked(auftragSenden).mock.calls.at(-1)[0].text, kontext = gesendet.split("\n\nNeue Nachricht:\n")[0];
  expect(kontext.length).toBeLessThanOrEqual(20000); expect(kontext).toMatch(/Verlauf gekürzt/);
  expect(kontext.match(/^Du: /gm) ?? []).toHaveLength(anzahl);
  expect(kontext).not.toContain(`Du: ${texte[0]}`);
  if (anzahl) expect(kontext.endsWith(`Du: ${texte.at(-1)}`)).toBe(true);
  expect(gesendet.endsWith("Neue Nachricht:\nNeue Bitte")).toBe(true);
  expect(chat().verlauf.map(n => n.text)).toEqual([...texte, "Neue Bitte"]);
});
it("sendet im leeren Chat keinen Kontextblock", async () => {
  const d = quelle.lesen(); d.chats[0].verlauf = []; quelle.aktualisieren(d);
  vi.mocked(auftragSenden).mockResolvedValue({ sitzung: null, erfolg: true });
  await ansicht().props.senden("Erste Nachricht");
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ text: "Erste Nachricht" }));
});
it("sperrt /neu bis die Rollen zum aktuellen Projekt geladen sind", () => {
  expect(ansicht().props.neuGesperrt).toBe(true); const d = quelle.lesen(); d.rollenPfad = d.kopf.pfad; quelle.aktualisieren(d);
  expect(ansicht().props.neuGesperrt).toBe(false);
});

describe("/kompakt", () => {
  beforeEach(() => {
    const d = quelle.lesen(); Object.assign(d.chats[0], { gestartetUm: null,
      sitzung: { id: "alt", anbieter: "Claude", pfad: d.kopf.pfad } }); quelle.aktualisieren(d);
  });
  it("sperrt im Browser ohne neue Nachricht und nennt den Grund", async () => {
    vi.mocked(isTauri).mockReturnValue(false); const vorher = chat();
    await ansicht().props.befehl("kompakt");
    expect(chat()).toEqual(vorher); expect(auftragSenden).not.toHaveBeenCalled();
    expect(ansicht().props.fehler).toBe("Nur in der Desktop-App");
  });
  it.each(["Opus 5.5", "gpt-6.1-sol"])("fasst für %s zusammen und startet danach mit freiem Kontext", async modell => {
    const d = quelle.lesen(); d.chats[0].modell = modell; d.chats[0].sitzung.anbieter = modell === "Opus 5.5" ? "Claude" : "Codex"; quelle.aktualisieren(d);
    const vorher = chat(), zusammenfassung = "Ziel: CSV. Entscheidung: UTF-8. Offen: Export. Datei: export.rs.";
    let beenden; vi.mocked(auftragSenden).mockReturnValueOnce(new Promise(resolve => { beenden = resolve; }));
    const lauf = ansicht().props.befehl("kompakt"); await Promise.resolve(); await Promise.resolve();
    expect(auftragSenden).toHaveBeenCalledWith(expect.objectContaining({ sitzung: vorher.sitzung, text: expect.stringMatching(/300 Wörter/) }));
    expect(chat().verlauf.at(-1).text).toBe("Verlauf wird zusammengefasst …");
    empfangen(chat().id, zusammenfassung); expect(chat().sitzung).toEqual(vorher.sitzung);
    beenden({ erfolg: true, sitzung: { ...vorher.sitzung, id: "neu" } }); await lauf;
    expect(chat()).toMatchObject({ sitzung: null, kontextProzent: 0, zusammenfassung: chat().verlauf.at(-1).id });
    expect(chat().verlauf.at(-1)).toMatchObject({ von: "Orchestrator", text: zusammenfassung, aktionen: [] });
    vi.mocked(auftragSenden).mockResolvedValue({ erfolg: true, sitzung: null });
    await ansicht().props.senden("Weiter"); const gesendet = auftragSenden.mock.calls.at(-1)[0];
    expect(gesendet.sitzung).toBeNull(); expect(gesendet.text).toContain(zusammenfassung);
    expect(gesendet.text).not.toContain(vorher.verlauf[0].text);
  });
  it("sendet nur die Zusammenfassung und alle Nachrichten danach, auch über 20", async () => {
    const d = quelle.lesen(), ziel = d.chats[0]; ziel.sitzung = null;
    ziel.verlauf.push({ id: "kurz", von: "Orchestrator", text: "Zusammengefasst", aktionen: [] }); ziel.zusammenfassung = "kurz";
    for (let i = 0; i < 22; i++) ziel.verlauf.push({ id: `n${i}`, von: "Du", text: `Danach ${i}`, aktionen: [] });
    quelle.aktualisieren(d); vi.mocked(auftragSenden).mockResolvedValue({ erfolg: true, sitzung: null });
    await ansicht().props.senden("Weiter"); const text = auftragSenden.mock.calls.at(-1)[0].text;
    expect(text).toContain("Zusammengefasst"); expect(text).toContain("Danach 0"); expect(text).toContain("Danach 21"); expect(text).not.toContain(ziel.verlauf[0].text);
  });
  it.each(["Fehler", "Exit-Code", "leer"])("behält bei Fehlschlag %s Sitzung und Verlauf unverändert", async art => {
    const vorher = chat(); vi.mocked(auftragSenden).mockImplementation(async () => {
      if (art !== "leer") empfangen(chat().id, "Fehlversuch");
      if (art === "Fehler") throw new Error("kaputt");
      return { erfolg: art === "leer", sitzung: null };
    });
    await ansicht().props.befehl("kompakt"); expect(chat()).toEqual(vorher);
    expect(ansicht().props.fehler).toMatch(/^Problem: /);
  });
});

it("fängt Senden aus einer alten Ansicht nach Entfernen des Chats ab", async () => {
  const senden = ansicht().props.senden, d = quelle.lesen(); d.chats = []; d.aktiverChatId = null; quelle.aktualisieren(d);
  await expect(senden("Weiter")).resolves.toBeUndefined(); expect(auftragSenden).not.toHaveBeenCalled();
});
