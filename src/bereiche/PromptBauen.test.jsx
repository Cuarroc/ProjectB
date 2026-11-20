import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isTauri } from "@tauri-apps/api/core";
import { BeispielQuelle } from "../daten/quelle";
import { anhangSpeichern, auftragSenden, chatNachrichtenHoeren } from "../daten/tauri";
import { useChatEingabe, ChatEingabeAnsicht } from "./ChatEingabe";
import PromptBauen, { auftragText } from "./PromptBauen";
import { modi } from "./chat-eingabe/Auswahlen";
import { kompaktSperrgrund } from "./chat-eingabe/Befehle";
const h = vi.hoisted(() => ({ werte: [], refs: [], i: 0, r: 0 }));
vi.mock("react", async original => ({ ...await original(),
  useState: initial => { const i = h.i++, werte = h.werte; if (!(i in werte)) werte[i] = typeof initial === "function" ? initial() : initial;
    return [werte[i], w => { werte[i] = typeof w === "function" ? w(werte[i]) : w; }]; },
  useRef: initial => h.refs[h.r++] ??= { current: initial }, useEffect: () => {}, useLayoutEffect: () => {},
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => true) }));
vi.mock("../daten/tauri", async original => ({ ...await original(), anhangSpeichern: vi.fn(), auftragSenden: vi.fn(), chatNachrichtenHoeren: vi.fn() }));
let quelle;
const eingabe = () => { h.i = h.r = 0; return useChatEingabe(quelle); };
const baum = el => Array.isArray(el) ? el.flatMap(baum) : [el, ...(Array.isArray(el?.props?.children) ? el.props.children : [el?.props?.children]).filter(Boolean).flatMap(k => typeof k === "object" ? baum(k) : [])];
beforeEach(() => { vi.mocked(isTauri).mockReturnValue(true); h.werte = []; h.refs = []; quelle = new BeispielQuelle(); const d = quelle.lesen();
  Object.assign(d.chats[0], { modus: "Prompt bauen", verlauf: [], gestartetUm: null }); d.kopf.geoeffnet = true; quelle.aktualisieren(d);
  vi.mocked(auftragSenden).mockResolvedValue({ erfolg: true, sitzung: null }); vi.mocked(chatNachrichtenHoeren).mockResolvedValue(() => {}); });
afterEach(() => vi.clearAllMocks());
it("hat den vierten Modus mit Erklärung und Platzhalter, ohne neue Einstellungen", () => {
  expect(modi[3]).toBe("Prompt bauen");
  const html = renderToStaticMarkup(<ChatEingabeAnsicht {...eingabe()} />);
  expect(html).toContain("Stichworte reichen, zum Beispiel: Paketliste, CSV, Status und Dauer …");
  expect(html).toContain("Aus Stichworten wird ein ausführlicher Auftrag. Du prüfst ihn, bevor er losgeht.");
  expect(html).not.toContain("Einstellungen für Prompt bauen");
});
it("öffnet beim Senden nur das Fenster, leert die Eingabe und sendet erst den bearbeiteten Auftrag", async () => {
  eingabe().schreiben("CSV Export"); await eingabe().senden("CSV Export");
  expect(auftragSenden).not.toHaveBeenCalled(); expect(eingabe().text).toBe("");
  const dialog = eingabe().promptBauen; expect(dialog.props.idee).toBe("CSV Export");
  const text = auftragText(["Export", "  ", "- CSV", "Test grün", "Keine Abhängigkeit"]);
  expect(text).toBe("## Ziel\nExport\n\n## Was genau\n- CSV\n\n## Fertig, wenn\nTest grün\n\n## Nicht tun\nKeine Abhängigkeit");
  await dialog.props.onSenden(text);
  expect(quelle.lesen().chats[0].modus).toBe("Ausführen");
  expect(auftragSenden).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ modus: "Ausführen", text }));
  expect(eingabe().promptBauen).toBeNull();
});
it("startet mit der Idee als Ziel, lässt andere Felder leer und sperrt mit Grund", () => {
  h.i = h.r = 0; const dialog = PromptBauen({ idee: "CSV", onSchliessen: vi.fn(), onSenden: vi.fn() });
  const felder = baum(dialog).filter(e => e.type === "textarea");
  expect(felder.map(e => e.props.value)).toEqual(["CSV", "CSV", "", "", "", ""]);
  for (const grund of ["Rückfragen kommen mit dem nächsten Paket.", "Ziele gibt es ab 0.2 Punkt 1."])
    expect(baum(dialog).find(e => e.props?.grund === grund).props.disabled).toBe(true);
  felder[1].props.onChange({ target: { value: "  " } }); h.i = h.r = 0;
  const leer = PromptBauen({ idee: "CSV" });
  expect(baum(leer).find(e => e.props?.text === "Als Auftrag senden").props).toMatchObject({ disabled: true, grund: "Bitte fülle zuerst das Ziel aus." });
});
it("bricht ab, ohne etwas zu senden", async () => {
  await eingabe().senden("Idee"); const props = eingabe().promptBauen.props;
  const gespeichert = h.werte; h.werte = []; h.i = h.r = 0;
  const dialog = PromptBauen(props); h.werte = gespeichert; baum(dialog).find(e => e.props?.text === "Abbrechen").props.onClick();
  expect(eingabe().promptBauen).toBeNull(); expect(auftragSenden).not.toHaveBeenCalled();
});
it("sendet die tatsächlich bearbeiteten Felder als Markdown", () => {
  const onSenden = vi.fn(), props = { idee: "Idee", onSenden, onSchliessen: vi.fn() }; h.i = h.r = 0;
  const dialog = () => { h.i = h.r = 0; return PromptBauen(props); };
  baum(dialog()).find(e => e.props?.["aria-label"] === "Hintergrund").props.onChange({ target: { value: "Für Excel" } });
  baum(dialog()).find(e => e.props?.text === "Als Auftrag senden").props.onClick();
  expect(onSenden).toHaveBeenCalledExactlyOnceWith("## Ziel\nIdee\n\n## Hintergrund\nFür Excel");
});
it.each([true, false])("sperrt /kompakt beim Prompt bauen mit Grund ohne Kernaufruf (Desktop: %s)", async desktop => {
  vi.mocked(isTauri).mockReturnValue(desktop);
  const d = quelle.lesen(); d.chats[0].verlauf.push({ id: "antwort", von: "Orchestrator", text: "Hallo", aktionen: [] }); quelle.aktualisieren(d);
  const grund = "Im Modus Prompt bauen gibt es /kompakt noch nicht. Wechsle kurz zu Ausführen.";
  expect(kompaktSperrgrund(d.chats[0], false, true)).toBe(grund);
  await eingabe().befehl("kompakt");
  expect(eingabe().fehler).toBe(grund); expect(auftragSenden).not.toHaveBeenCalled();
  expect(quelle.lesen().chats[0]).toEqual(d.chats[0]);
});
it("behält bei Anhangfehler den bearbeiteten Auftrag, das Fenster und den Modus", async () => {
  await eingabe().anhaenge.hinzufuegen([new File(["CSV"], "export.csv", { type: "text/csv" })]);
  await eingabe().senden("Idee");
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
  expect(quelle.lesen().chats[0]).toMatchObject({ modus: "Prompt bauen", verlauf: [] });
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
  await eingabe().anhaenge.hinzufuegen([new File(["CSV"], "export.csv")]); await eingabe().senden("Idee");
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
