import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BeispielQuelle } from "../../daten/quelle";
import { auftragSenden, chatNachrichtenHoeren } from "../../daten/tauri";
import { useChatEingabe } from "../ChatEingabe";
import { renderToStaticMarkup } from "react-dom/server";
import ChatVerlauf from "../ChatVerlauf";

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
const sitzung = () => ({ id: "s-interview", anbieter: "Claude", pfad: quelle.lesen().kopf.pfad });
const antwort = async (text, erfolg = true) => {
  const lauf = ansicht().senden("Bitte frage nach."); await Promise.resolve();
  empfangen(chat().id, "Zwischenstand\n- Alt A\n- Alt B"); empfangen(chat().id, text);
  beenden(erfolg === "Fehler" ? Promise.reject(new Error("kaputt")) : { sitzung: sitzung(), erfolg }); await lauf;
};
beforeEach(() => {
  h.werte = []; h.refs = []; quelle = new BeispielQuelle();
  const d = quelle.lesen(); d.kopf.geoeffnet = true; Object.assign(d.chats[0], { modus: "Interview", gestartetUm: null }); quelle.aktualisieren(d);
  vi.mocked(chatNachrichtenHoeren).mockImplementation(async cb => { empfangen = cb; return () => {}; });
  vi.mocked(auftragSenden).mockImplementation(() => new Promise(resolve => { beenden = resolve; }));
  ansicht(); aufraeumen = h.effekte.map(fn => fn());
});
afterEach(() => { aufraeumen.forEach(fn => fn?.()); vi.resetAllMocks(); });
it.each([
  ["Frage?\n- Nur ich\n- Mein Team", ["Nur ich", "Mein Team"]],
  ["Frage?\n* Nur ich\n* Mein Team\n* Alle", ["Nur ich", "Mein Team", "Alle"]],
  ["Frage?\r\n1. Eins\r\n2. Zwei\r\n3. Drei\r\n4. Vier\r\n \t", ["Eins", "Zwei", "Drei", "Vier"]],
])("hängt nur an die letzte Antwort dieses Laufs Vorschläge: %s", async (text, punkte) => {
  await antwort(text);
  expect(chat().verlauf.at(-1).aktionen.map(a => a.text)).toEqual(punkte);
  expect(chat().verlauf.slice(0, -1).every(n => n.aktionen.length === 0)).toBe(true);
});
it.each([
  ["Interview", true, "Frage?\n- Eins"],
  ["Interview", true, "Frage?\n- Eins\n- Zwei\n- Drei\n- Vier\n- Fünf"],
  ["Interview", true, "Frage?\n- Eins\n- Zwei\nBitte wähle."],
  ["Interview", true, "Zusammenfassung: Ein CSV-Export. Ist das richtig?"],
  ["Ausführen", true, "Frage?\n- Eins\n- Zwei"],
  ["Interview", false, "Frage?\n- Eins\n- Zwei"],
  ["Interview", "Fehler", "Frage?\n- Eins\n- Zwei"],
])("erzeugt keine Vorschläge: %s, %s, %s", async (modus, erfolg, text) => {
  const d = quelle.lesen(); d.chats[0].modus = modus; quelle.aktualisieren(d);
  await antwort(text, erfolg); expect(chat().verlauf.every(n => n.aktionen.length === 0)).toBe(true);
});
it("wartet auf den erfolgreichen Abschluss und ignoriert alte Listen ohne neue Antwort", async () => {
  await antwort("Frage?\n- Eins\n- Zwei");
  const lauf = ansicht().senden("Weiter"); await Promise.resolve();
  beenden({ sitzung: sitzung(), erfolg: true }); await lauf;
  expect(chat().verlauf.every(n => n.aktionen.length === 0)).toBe(true);
  const neu = ansicht().senden("Noch eine Frage"); await Promise.resolve();
  empfangen(chat().id, "Frage?\n- Drei\n- Vier");
  expect(chat().verlauf.at(-1).aktionen).toEqual([]);
  beenden({ sitzung: sitzung(), erfolg: true }); await neu;
  expect(chat().verlauf.at(-1).aktionen).toHaveLength(2);
});
it("kürzt nur den Knopf auf 80 Zeichen und sendet beim Doppelklick den vollen Punkt einmal im Interview", async () => {
  const punkt = "Ein vollständiger Vorschlag mit Umlauten: " + "Ä".repeat(90);
  await antwort(`Frage?\n- ${punkt}\n- Kurz`);
  const n = chat().verlauf.at(-1); expect(n.aktionen[0]).toMatchObject({ id: "antwort-0", text: "Ein vollständiger Vorschlag mit Umlauten:…" });
  const aktion = ansicht().onAktion, lauf = aktion(n.id, "antwort-0"); await aktion(n.id, "antwort-0"); await Promise.resolve();
  expect(auftragSenden).toHaveBeenCalledTimes(2);
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ modus: "Interview", text: punkt, sitzung: sitzung() }));
  expect(chat().modus).toBe("Interview"); expect(chat().verlauf.at(-1)).toMatchObject({ von: "Du", text: punkt });
  expect(chat().verlauf.every(n => n.aktionen.length === 0)).toBe(true);
  beenden({ sitzung: sitzung(), erfolg: true }); await lauf;
  await ansicht().onAktion(n.id, "antwort-0"); expect(auftragSenden).toHaveBeenCalledTimes(2);
});
it("setzt nach einem Wechsel zu Ausführen vor der Interview-Antwort den Modus zurück", async () => {
  await antwort("Frage?\n- Nur ich\n- Mein Team");
  const n = chat().verlauf.at(-1), d = quelle.lesen();
  d.chats[0].modus = "Ausführen"; quelle.aktualisieren(d);
  const lauf = ansicht().onAktion(n.id, "antwort-0"); await Promise.resolve();
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ modus: "Interview", text: "Nur ich" }));
  expect(chat().modus).toBe("Interview");
  beenden({ sitzung: sitzung(), erfolg: true }); await lauf;
});
it.each([79, 80, 81])("zeigt bei %s Zeichen höchstens 80 Zeichen und behält den vollen zugänglichen Namen", async anzahl => {
  const punkt = "🙂".repeat(anzahl);
  await antwort(`Frage?\n- ${punkt}\n- Kurz`);
  const aktion = chat().verlauf.at(-1).aktionen[0];
  expect(aktion.text).toBe(anzahl > 80 ? "🙂".repeat(79) + "…" : punkt);
  expect(Array.from(aktion.text).length).toBeLessThanOrEqual(80);
  h.werte = []; h.i = 0;
  const html = renderToStaticMarkup(<ChatVerlauf quelle={quelle} onAktion={() => {}} />);
  expect(html).toContain(`aria-label="${punkt}"`);
  expect(html).toContain(aktion.text);
});
it.each([
  ["**Nur ich**", "Nur ich"], ["*Mein Team*", "Mein Team"], ["`CSV`", "CSV"],
  ["**Nur ich** mit *Team* und `CSV`", "Nur ich mit Team und CSV"],
])("entfernt Inline-Markdown aus Knopf und gesendeter Antwort: %s", async (markdown, klartext) => {
  await antwort(`Frage?\n- ${markdown}\n- Alle`);
  const n = chat().verlauf.at(-1);
  expect(n.aktionen[0]).toMatchObject({ text: klartext, antwort: klartext });
  const lauf = ansicht().onAktion(n.id, "antwort-0"); await Promise.resolve();
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ text: klartext }));
  expect(chat().verlauf.at(-1)).toMatchObject({ von: "Du", text: klartext });
  beenden({ sitzung: sitzung(), erfolg: true }); await lauf;
});
