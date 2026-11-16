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
const antwort = async text => {
  const lauf = ansicht().senden("Auftrag"); await Promise.resolve();
  empfangen(chat().id, text); beenden({ sitzung: null, erfolg: true }); await lauf;
};
beforeEach(() => {
  h.werte = []; h.refs = []; quelle = new BeispielQuelle();
  const d = quelle.lesen(); d.kopf.geoeffnet = true; d.chats[0].gestartetUm = null;
  d.chats.push({ ...d.chats[0], id: "anderer", todos: [{ id: "fremd", text: "Unberührt", fertig: false }] }); quelle.aktualisieren(d);
  vi.mocked(chatNachrichtenHoeren).mockImplementation(async cb => { empfangen = cb; return () => {}; });
  vi.mocked(auftragSenden).mockImplementation(() => new Promise(resolve => { beenden = resolve; }));
  ansicht(); aufraeumen = h.effekte.map(fn => fn());
});
afterEach(() => { aufraeumen.forEach(fn => fn?.()); vi.resetAllMocks(); });
it.each(["Ausführen", "Planen", "Interview"])("übernimmt in %s nur die letzte Aufgabenliste, ohne Markdown", async modus => {
  const d = quelle.lesen(); d.chats[0].modus = modus; quelle.aktualisieren(d);
  await antwort("Entwurf:\n- [ ] Alt\n\nStand:\r\n* [X] **Lesen** mit `CSV`\r\n- [ ] *Prüfen*\nDas ist der Stand.");
  expect(chat().todos).toEqual([expect.objectContaining({ text: "Lesen mit CSV", fertig: true }), expect.objectContaining({ text: "Prüfen", fertig: false })]);
  expect(quelle.lesen().chats[1].todos).toEqual(d.chats[1].todos);
});
it("ersetzt Orchestrator-Aufgaben, erhält eigene hinten und lässt Antworten ohne Liste unverändert", async () => {
  await antwort("- [ ] Alt");
  const d = quelle.lesen(); d.chats[0].todos.push({ id: "eigen", text: "Meine Aufgabe", fertig: true, von: "Du" }); quelle.aktualisieren(d);
  const lauf = ansicht().senden("Weiter"); await Promise.resolve();
  const neu = quelle.lesen(); neu.aktiverChatId = "anderer"; quelle.aktualisieren(neu);
  empfangen(chat().id, "- [x] Neu"); beenden({ sitzung: null, erfolg: true }); await lauf;
  expect(chat().todos).toEqual([expect.objectContaining({ text: "Neu", fertig: true }), d.chats[0].todos[1]]);
  const zurueck = quelle.lesen(); zurueck.aktiverChatId = chat().id; quelle.aktualisieren(zurueck);
  const vorher = chat().todos; await antwort("Keine Aufgabenliste."); expect(chat().todos).toEqual(vorher);
});
it("begrenzt auf 20 Einträge und behält eigene Aufgaben", async () => {
  const d = quelle.lesen(); d.chats[0].todos = [{ id: "du", text: "Eigene", fertig: false, von: "Du" }]; quelle.aktualisieren(d);
  await antwort(Array.from({ length: 25 }, (_, i) => `- [ ] Aufgabe ${i}`).join("\n"));
  expect(chat().todos).toHaveLength(20); expect(chat().todos.at(-1)).toEqual(d.chats[0].todos[0]);
});
it.each(["  ", "\t"])("behält Aufgaben vor einer eingerückten Folgezeile (%j)", async einzug => {
  await antwort(`- [ ] Export bauen\n${einzug}Fertig, wenn die CSV-Datei korrekt ist.\n- [ ] Export testen`);
  expect(chat().todos.map(todo => todo.text)).toEqual(["Export bauen", "Export testen"]);
});
it.each(["```", "~~~"])("ignoriert Codeblöcke (%s), ohne die Liste zu beenden", async zaun => {
  await antwort(`- [ ] Export bauen\n${zaun}text\nKeine Aufgabe\n- [ ] Beispielaufgabe\n${zaun}\n- [ ] Export testen\n${zaun}\n- [ ] Weiteres Beispiel\n${zaun}`);
  expect(chat().todos.map(todo => todo.text)).toEqual(["Export bauen", "Export testen"]);
});
