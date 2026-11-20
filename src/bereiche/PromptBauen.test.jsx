import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isTauri } from "@tauri-apps/api/core";
import { BeispielQuelle } from "../daten/quelle";
import { anhangSpeichern, auftragSenden, chatNachrichtenHoeren } from "../daten/tauri";
import { useChatEingabe, ChatEingabeAnsicht } from "./ChatEingabe";
import PromptBauen, { auftragText } from "./PromptBauen";
import { modi } from "./chat-eingabe/Auswahlen";
import { kompaktSperrgrund } from "./chat-eingabe/Befehle";
const h = vi.hoisted(() => ({ werte: [], refs: [], effekte: [], i: 0, r: 0 }));
vi.mock("react", async original => ({ ...await original(),
  useState: initial => { const i = h.i++, werte = h.werte; if (!(i in werte)) werte[i] = typeof initial === "function" ? initial() : initial;
    return [werte[i], w => { werte[i] = typeof w === "function" ? w(werte[i]) : w; }]; },
  useRef: initial => h.refs[h.r++] ??= { current: initial }, useEffect: fn => h.effekte.push(fn), useLayoutEffect: () => {},
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => true) }));
vi.mock("../daten/tauri", async original => ({ ...await original(), anhangSpeichern: vi.fn(), auftragSenden: vi.fn(), chatNachrichtenHoeren: vi.fn() }));
let quelle;
const eingabe = () => { if (h.werte.length) h.werte[0] = quelle.lesen(); h.i = h.r = 0; return useChatEingabe(quelle); };
const baum = el => Array.isArray(el) ? el.flatMap(baum) : [el, ...(Array.isArray(el?.props?.children) ? el.props.children : [el?.props?.children]).filter(Boolean).flatMap(k => typeof k === "object" ? baum(k) : [])];
beforeEach(() => { vi.mocked(isTauri).mockReturnValue(true); h.werte = []; h.refs = []; h.effekte = []; quelle = new BeispielQuelle(); const d = quelle.lesen();
  Object.assign(d.chats[0], { modus: "Prompt bauen", verlauf: [], gestartetUm: null }); d.kopf.geoeffnet = true; quelle.aktualisieren(d);
  vi.mocked(auftragSenden).mockResolvedValue({ erfolg: true, sitzung: null }); vi.mocked(chatNachrichtenHoeren).mockResolvedValue(() => {}); });
afterEach(() => vi.clearAllMocks());
it("hat den vierten Modus mit Erklärung, Platzhalter und Einstellungen", () => {
  expect(modi[3]).toBe("Prompt bauen");
  const html = renderToStaticMarkup(<ChatEingabeAnsicht {...eingabe()} />);
  expect(html).toContain("Stichworte reichen, zum Beispiel: Paketliste, CSV, Status und Dauer …");
  expect(html).toContain("Aus Stichworten wird ein ausführlicher Auftrag. Du prüfst ihn, bevor er losgeht.");
  expect(html).toContain("Einstellungen für Prompt bauen: Empfohlen");
});
it("öffnet beim Senden das Fenster, sendet die Idee zum Kern und später den bearbeiteten Auftrag", async () => {
  eingabe().schreiben("CSV Export"); await eingabe().senden("CSV Export");
  expect(auftragSenden).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ modus: "Prompt bauen", text: "CSV Export" })); expect(eingabe().text).toBe("");
  vi.mocked(auftragSenden).mockClear();
  const dialog = eingabe().promptBauen; expect(dialog.props.idee).toBe("CSV Export");
  const text = auftragText(["Export", "  ", "- CSV", "Test grün", "Keine Abhängigkeit"]);
  expect(text).toBe("## Ziel\nExport\n\n## Was genau\n- CSV\n\n## Fertig, wenn\nTest grün\n\n## Nicht tun\nKeine Abhängigkeit");
  await dialog.props.onSenden(text);
  expect(quelle.lesen().chats[0].modus).toBe("Ausführen");
  expect(auftragSenden).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ modus: "Ausführen", text: expect.stringContaining(text) }));
  expect(eingabe().promptBauen).toBeNull();
});
it("startet mit der Idee als Ziel, lässt andere Felder leer und sperrt mit Grund", () => {
  h.i = h.r = 0; const dialog = PromptBauen({ idee: "CSV", onSchliessen: vi.fn(), onSenden: vi.fn() });
  const felder = baum(dialog).filter(e => e.type === "textarea");
  expect(felder.map(e => e.props.value)).toEqual(["CSV", "CSV", "", "", "", ""]);
  for (const grund of ["Bitte warte zuerst auf einen Auftragsentwurf.", "Ziele gibt es ab 0.2 Punkt 1."])
    expect(baum(dialog).find(e => e.props?.grund === grund).props.disabled).toBe(true);
  felder[1].props.onChange({ target: { value: "  " } }); h.i = h.r = 0;
  const leer = PromptBauen({ idee: "CSV" });
  expect(baum(leer).find(e => e.props?.text === "Als Auftrag senden").props).toMatchObject({ disabled: true, grund: "Bitte fülle zuerst das Ziel aus." });
});
it("bricht ab, ohne einen Ausführungsauftrag zu senden", async () => {
  await eingabe().senden("Idee"); const props = eingabe().promptBauen.props;
  const gespeichert = h.werte; h.werte = []; h.i = h.r = 0;
  const dialog = PromptBauen(props); h.werte = gespeichert; baum(dialog).find(e => e.props?.text === "Abbrechen").props.onClick();
  expect(eingabe().promptBauen).toBeNull(); expect(auftragSenden).toHaveBeenCalledTimes(1);
});
it("sendet die tatsächlich bearbeiteten Felder als Markdown", () => {
  const onSenden = vi.fn(), props = { idee: "Idee", onSenden, onSchliessen: vi.fn() }; h.i = h.r = 0;
  const dialog = () => { h.i = h.r = 0; return PromptBauen(props); };
  baum(dialog()).find(e => e.props?.["aria-label"] === "Hintergrund").props.onChange({ target: { value: "Für Excel" } });
  baum(dialog()).find(e => e.props?.text === "Als Auftrag senden").props.onClick();
  expect(onSenden).toHaveBeenCalledExactlyOnceWith("## Ziel\nIdee\n\n## Hintergrund\nFür Excel");
});
it.each([true, false])("erlaubt /kompakt beim Prompt bauen nur auf dem Desktop (%s)", async desktop => {
  vi.mocked(isTauri).mockReturnValue(desktop);
  const d = quelle.lesen(); d.chats[0].verlauf.push({ id: "antwort", von: "Orchestrator", text: "Hallo", aktionen: [] }); quelle.aktualisieren(d);
  expect(kompaktSperrgrund(d.chats[0], false, true)).toBe(desktop ? "" : "Nur in der Desktop-App");
  await eingabe().befehl("kompakt");
  if (desktop) expect(auftragSenden).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ modus: "Prompt bauen" }));
  else { expect(auftragSenden).not.toHaveBeenCalled(); expect(quelle.lesen().chats[0]).toEqual(d.chats[0]); }
});
it("behält bei Anhangfehler den bearbeiteten Auftrag, das Fenster und den Modus", async () => {
  await eingabe().anhaenge.hinzufuegen([new File(["CSV"], "export.csv", { type: "text/csv" })]);
  await eingabe().senden("Idee"); vi.mocked(auftragSenden).mockClear();
  const formular = { werte: [], refs: [] }, texte = ["Export", "Für Excel", "CSV", "Test grün", "Keine Abhängigkeit"];
  const fenster = props => {
    const hook = { werte: h.werte, refs: h.refs }; Object.assign(h, formular, { i: 0, r: 0 });
    const el = PromptBauen(props); Object.assign(h, hook); return el;
  };
  const props = eingabe().promptBauen.props;
  baum(fenster(props)).filter(e => e.type === "textarea").slice(1).forEach((e, i) => e.props.onChange({ target: { value: texte[i] } }));
  vi.mocked(anhangSpeichern).mockRejectedValueOnce(new Error("Datenträger voll"));
  await baum(fenster(props)).find(e => e.props?.text === "Als Auftrag senden").props.onClick();
  const aktuell = eingabe(); expect(aktuell.promptBauen).not.toBeNull();
  expect(quelle.lesen().chats[0]).toMatchObject({ modus: "Prompt bauen", verlauf: [expect.objectContaining({ text: "Idee" })] });
  expect(auftragSenden).not.toHaveBeenCalled(); expect(aktuell.anhaenge.dateien).toHaveLength(1);
  const dialog = fenster(aktuell.promptBauen.props);
  expect(baum(dialog).filter(e => e.type === "textarea").slice(1).map(e => e.props.value)).toEqual(texte);
  expect(baum(dialog).find(e => e.props?.role === "alert")?.props.children).toBe("Nicht gesendet: Datenträger voll");
});
it.each([["antwort-0", "Interview"], ["plan-kommentieren", "Planen"], ["plan-freigeben", "Ausführen"]])("sendet Nachrichtenaktion %s nach Prompt bauen als %s", async (id, modus) => {
  const d = quelle.lesen(); d.chats[0].verlauf = [{ id: "alt", von: "Orchestrator", text: "Vorschlag", aktionen: [{ id, antwort: "Antwort" }] }]; quelle.aktualisieren(d);
  await eingabe().onAktion("alt", id, "Kommentar");
  expect(auftragSenden).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ modus }));
});
it("sendet auch aus einer veralteten Eingabe niemals Prompt bauen an den Kern", async () => {
  const d = quelle.lesen(); d.chats[0].modus = "Ausführen"; quelle.aktualisieren(d); const senden = eingabe().senden;
  eingabe().aendern({ modus: "Prompt bauen" }); await senden("Alt");
  expect(auftragSenden).not.toHaveBeenCalled(); expect(quelle.lesen().chats[0].verlauf).toEqual([]);
});
it("schließt erst nach dem Speichern des Anhangs und vor der Kernantwort", async () => {
  await eingabe().anhaenge.hinzufuegen([new File(["CSV"], "export.csv")]); await eingabe().senden("Idee"); vi.mocked(auftragSenden).mockClear();
  let speichern, antwort;
  vi.mocked(anhangSpeichern).mockImplementationOnce(() => new Promise(resolve => { speichern = resolve; }));
  vi.mocked(auftragSenden).mockImplementationOnce(() => new Promise(resolve => { antwort = resolve; }));
  const lauf = eingabe().promptBauen.props.onSenden("## Ziel\nBearbeitet");
  expect(eingabe().promptBauen).not.toBeNull(); expect(quelle.lesen().chats[0].modus).toBe("Prompt bauen");
  speichern(".projectb/anhaenge/export.csv"); await Promise.resolve(); await Promise.resolve();
  expect(eingabe().promptBauen).toBeNull(); expect(quelle.lesen().chats[0].verlauf.at(-1).text).toBe("## Ziel\nBearbeitet");
  expect(auftragSenden).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ modus: "Ausführen" }));
  antwort({ erfolg: true, sitzung: null }); await lauf;
});

it("liest nur den Fenster-Verlauf, zeigt Rückfragen und verfeinert bearbeitete Felder", async () => {
  const nachricht = (von, text) => { const d = quelle.lesen(); d.chats[0].verlauf.push({ id: crypto.randomUUID(), von, text, aktionen: [] }); quelle.aktualisieren(d); };
  nachricht("Orchestrator", "## Ziel\nAlter Entwurf"); await eingabe().senden("CSV");
  const formular = { werte: [], refs: [] }, fenster = () => {
    const props = eingabe().promptBauen.props, hook = { werte: h.werte, refs: h.refs };
    Object.assign(h, formular, { i: 0, r: 0 }); const el = PromptBauen(props); Object.assign(h, hook); return baum(el);
  };
  expect(fenster().find(e => e.props?.text === "Weiter verfeinern").props.disabled).toBe(true);
  nachricht("Orchestrator", "Für wen?\n\n- Kunden\n- Intern");
  expect(fenster().find(e => e.type === "h3" && e.props.children === "Frage an dich")).toBeTruthy();
  await fenster().find(e => e.props?.text === "Kunden").props.onClick();
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ modus: "Prompt bauen", text: expect.stringContaining("Kunden") }));
  expect(fenster().find(e => Array.isArray(e.props?.children) && e.props.children.join("") === "1 beantwortet")).toBeTruthy();
  nachricht("Orchestrator", "Welches Format?\n- CSV\n- JSON");
  fenster().find(e => e.props?.["aria-label"] === "Deine Antwort").props.onChange({ target: { value: "Excel" } });
  await fenster().find(e => e.props?.text === "Antwort senden").props.onClick();
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ modus: "Prompt bauen", text: expect.stringContaining("Excel") }));
  nachricht("Orchestrator", "## Ziel\nExport\n## Hintergrund\nExcel\n## Was genau\nCSV\n## Fertig, wenn\nTest\n## Nicht tun\nKeine Abhängigkeit");
  expect(fenster().filter(e => e.type === "textarea").slice(1).map(e => e.props.value)).toEqual(["Export", "Excel", "CSV", "Test", "Keine Abhängigkeit"]);
  fenster().find(e => e.props?.["aria-label"] === "Ziel").props.onChange({ target: { value: "Bearbeiteter Export" } });
  await fenster().find(e => e.props?.text === "Weiter verfeinern").props.onClick();
  expect(auftragSenden).toHaveBeenLastCalledWith(expect.objectContaining({ modus: "Prompt bauen", text: expect.stringContaining("Verfeinere diesen Auftrag. Frag nach, wenn etwas fehlt.\n\n## Ziel\nBearbeiteter Export") }));
  nachricht("Orchestrator", "## Ziel: Neuer Export");
  expect(fenster().find(e => e.props?.["aria-label"] === "Ziel").props.value).toBe("Neuer Export");
  expect(quelle.lesen().chats[0].verlauf.filter(n => n.von === "Orchestrator").every(n => n.aktionen.length === 0)).toBe(true);
});
it("sperrt Antworten und Verfeinern während der Orchestrator schreibt", async () => {
  let fertig; vi.mocked(auftragSenden).mockImplementationOnce(() => new Promise(r => { fertig = r; }));
  const lauf = eingabe().senden("CSV"); await Promise.resolve();
  const props = eingabe().promptBauen.props; h.werte = []; h.refs = []; h.i = h.r = 0;
  const el = baum(PromptBauen({ ...props, frage: { text: "Format?", aktionen: [{ text: "CSV", antwort: "CSV" }] } }));
  expect(el.find(e => e.props?.role === "status").props.children).toBe("Orchestrator schreibt …");
  for (const text of ["CSV", "Antwort senden", "Weiter verfeinern", "Als Auftrag senden"]) expect(el.find(e => e.props?.text === text).props).toMatchObject({ disabled: true, grund: expect.any(String) });
  fertig({ erfolg: true, sitzung: null }); await lauf;
});

it("gibt Prompt-Rückfragen im Chat keine Interview-Knöpfe", async () => {
  let empfangen; vi.mocked(chatNachrichtenHoeren).mockImplementationOnce(async cb => { empfangen = cb; return () => {}; });
  eingabe(); const aufraeumen = h.effekte.map(fn => fn());
  vi.mocked(auftragSenden).mockImplementationOnce(async () => {
    empfangen(quelle.lesen().chats[0].id, "Format?\n- CSV\n- JSON");
    return { erfolg: true, sitzung: null };
  });
  await eingabe().senden("Export");
  expect(quelle.lesen().chats[0].verlauf.at(-1).aktionen).toEqual([]);
  await eingabe().onAktion(quelle.lesen().chats[0].verlauf.at(-1).id, "antwort-0");
  expect(quelle.lesen().chats[0].modus).toBe("Prompt bauen"); expect(auftragSenden).toHaveBeenCalledTimes(1); aufraeumen.forEach(fn => fn?.());
});

it.each(["- Eins\n* Zwei", "1. Eins\r\n2. Zwei"])("trennt Vorschläge zeilenweise vom Fragetext: %s", async liste => {
  await eingabe().senden("Export"); const d = quelle.lesen();
  d.chats[0].verlauf.push({ id: "frage", von: "Orchestrator", text: `Welches Format?\n\n${liste}\n \t`, aktionen: [] }); quelle.aktualisieren(d);
  const props = eingabe().promptBauen.props;
  expect(props.frage.text).toBe("Welches Format?"); expect(props.frage.aktionen.map(a => a.antwort)).toEqual(["Eins", "Zwei"]);
  h.werte = []; h.refs = []; h.i = h.r = 0;
  expect(baum(PromptBauen(props)).find(e => e.props?.["aria-label"] === "Deine Antwort").props.placeholder).toBe("Eigene Antwort …");
});
it.each(["\n" + "\t\t\t\n".repeat(5000), "\r\n\t\t\t".repeat(5000)])("wertet lange Leerzeilen in unter 100 ms aus (%#)", async leer => {
  await eingabe().senden("Export"); const d = quelle.lesen();
  d.chats[0].verlauf.push({ id: "frage", von: "Orchestrator", text: `Welches Format?${leer}\n- CSV\n- JSON${leer}`, aktionen: [] }); quelle.aktualisieren(d);
  const start = performance.now(), frage = eingabe().promptBauen.props.frage, dauer = performance.now() - start;
  expect(frage.text).toBe("Welches Format?"); expect(dauer).toBeLessThan(100);
});
it.each(["Welches For", "## Ziel\nHalber Entwurf"])("wertet die letzte laufende Antwort erst nach Abschluss aus: %s", async text => {
  await eingabe().senden("Export"); const d = quelle.lesen();
  d.chats[0].verlauf.push({ id: "alt", von: "Orchestrator", text: "Welches Format?\n- CSV\n- JSON", aktionen: [] }); quelle.aktualisieren(d);
  let fertig; vi.mocked(auftragSenden).mockImplementationOnce(() => new Promise(r => { fertig = r; }));
  const lauf = eingabe().promptBauen.props.onAntwort("CSV"); await Promise.resolve();
  const neu = quelle.lesen(); neu.chats[0].verlauf.push({ id: "stream", von: "Orchestrator", text, aktionen: [] }); quelle.aktualisieren(neu);
  const props = eingabe().promptBauen.props;
  expect(props.frage).toBeUndefined(); expect(props.abschnitte).toBeUndefined(); expect(props.rueckfragen).toEqual([{ text: "Welches Format?", antwort: "CSV" }]);
  const hook = { werte: h.werte, refs: h.refs }; h.werte = []; h.refs = []; h.i = h.r = 0;
  const el = baum(PromptBauen(props)); Object.assign(h, hook);
  expect(el.find(e => e.type === "h3" && e.props.children === "Frage an dich")).toBeUndefined();
  expect(el.find(e => e.props?.role === "status").props.children).toBe("Orchestrator schreibt …");
  fertig({ erfolg: true, sitzung: null }); await lauf;
  const abgeschlossen = eingabe().promptBauen.props;
  if (text.startsWith("##")) expect(abgeschlossen.abschnitte[0]).toBe("Halber Entwurf");
  else expect(abgeschlossen.frage.text).toBe(text);
});

const testFenster = () => {
  const formular = { werte: [], refs: [] };
  return (props = eingabe().promptBauen.props) => { const hook = { werte: h.werte, refs: h.refs };
    Object.assign(h, formular, { i: 0, r: 0 }); const el = baum(PromptBauen(props)); Object.assign(h, hook); return el; };
};
it("sperrt Idee und alle fünf Abschnitte während des Schreibens", () => {
  h.i = h.r = 0; const props = { idee: "CSV", laeuft: true };
  const felder = baum(PromptBauen(props)).filter(e => e.type === "textarea"); expect(felder).toHaveLength(6);
  expect(felder.every(e => e.props.readOnly || e.props.disabled)).toBe(true);
  h.i = h.r = 0; expect(baum(PromptBauen({ ...props, laeuft: false })).filter(e => e.type === "textarea").every(e => !e.props.readOnly && !e.props.disabled)).toBe(true);
});
it("zählt Verfeinern nicht als Antwort und hält die Frage bis zur neuen Antwort offen", async () => {
  await eingabe().senden("CSV"); const d = quelle.lesen();
  d.chats[0].verlauf.push({ id: "entwurf", von: "Orchestrator", text: "## Ziel\nCSV", aktionen: [] }, { id: "frage", von: "Orchestrator", text: "Für wen?", aktionen: [] }); quelle.aktualisieren(d);
  const fenster = testFenster(); let fertig; vi.mocked(auftragSenden).mockImplementationOnce(() => new Promise(r => { fertig = r; }));
  const lauf = fenster().find(e => e.props?.text === "Weiter verfeinern").props.onClick(); await Promise.resolve();
  expect(eingabe().promptBauen.props).toMatchObject({ frage: { text: "Für wen?" }, rueckfragen: [] });
  const neu = quelle.lesen(); neu.chats[0].verlauf.push({ id: "neu", von: "Orchestrator", text: "Welches Format?", aktionen: [] }); quelle.aktualisieren(neu);
  expect(eingabe().promptBauen.props.frage.text).toBe("Für wen?"); fertig({ erfolg: true, sitzung: null }); await lauf;
  expect(eingabe().promptBauen.props).toMatchObject({ frage: { text: "Welches Format?" }, rueckfragen: [] });
});
it("behält die freie Antwort bei frühem Fehler und leert erst nach dem Ablegen", async () => {
  await eingabe().senden("CSV"); const d = quelle.lesen(); d.kopf.geoeffnet = false;
  d.chats[0].verlauf.push({ id: "frage", von: "Orchestrator", text: "Format?", aktionen: [] }); quelle.aktualisieren(d);
  const fenster = testFenster(), props = eingabe().promptBauen.props, feld = () => fenster(props).find(e => e.props?.["aria-label"] === "Deine Antwort");
  feld().props.onChange({ target: { value: "Excel" } }); await fenster().find(e => e.props?.text === "Antwort senden").props.onClick();
  expect(feld().props.value).toBe("Excel"); expect(quelle.lesen().chats[0].verlauf.at(-1).von).toBe("Orchestrator");
  const neu = quelle.lesen(); neu.kopf.geoeffnet = true; quelle.aktualisieren(neu); let fertig;
  vi.mocked(auftragSenden).mockImplementationOnce(() => new Promise(r => { fertig = r; }));
  const lauf = fenster().find(e => e.props?.text === "Antwort senden").props.onClick(); await Promise.resolve();
  expect(quelle.lesen().chats[0].verlauf.at(-1).text).toBe("Excel"); expect(feld().props.value).toBe(""); fertig({ erfolg: true, sitzung: null }); await lauf;
});
it("sendet nach frühem Startfehler die bearbeitete Idee einmal erneut im Prompt-Modus", async () => {
  const d = quelle.lesen(); d.kopf.geoeffnet = false; quelle.aktualisieren(d); await eingabe().senden("CSV");
  const fenster = testFenster(); expect(fenster().find(e => e.props?.role === "alert").props.children).toContain("Projekt öffnen");
  expect(fenster().find(e => e.props?.text === "Idee senden")).toBeTruthy();
  fenster().find(e => e.props?.["aria-label"] === "Deine Idee").props.onChange({ target: { value: "Excel Export" } });
  const neu = quelle.lesen(); neu.kopf.geoeffnet = true; quelle.aktualisieren(neu);
  await fenster().find(e => e.props?.text === "Idee senden").props.onClick();
  expect(auftragSenden).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ modus: "Prompt bauen", text: "Excel Export" }));
  expect(quelle.lesen().chats[0].verlauf).toHaveLength(1); expect(fenster().find(e => e.props?.text === "Idee senden")).toBeUndefined();
});
