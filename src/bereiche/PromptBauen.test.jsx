import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BeispielQuelle } from "../daten/quelle";
import { auftragSenden, chatNachrichtenHoeren } from "../daten/tauri";
import { useChatEingabe, ChatEingabeAnsicht } from "./ChatEingabe";
import PromptBauen, { auftragText } from "./PromptBauen";
import { modi } from "./chat-eingabe/Auswahlen";
const h = vi.hoisted(() => ({ werte: [], refs: [], i: 0, r: 0 }));
vi.mock("react", async original => ({ ...await original(),
  useState: initial => { const i = h.i++; if (!(i in h.werte)) h.werte[i] = typeof initial === "function" ? initial() : initial;
    return [h.werte[i], w => { h.werte[i] = typeof w === "function" ? w(h.werte[i]) : w; }]; },
  useRef: initial => h.refs[h.r++] ??= { current: initial }, useEffect: () => {}, useLayoutEffect: () => {},
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("../daten/tauri", async original => ({ ...await original(), auftragSenden: vi.fn(), chatNachrichtenHoeren: vi.fn() }));
let quelle;
const eingabe = () => { h.i = h.r = 0; return useChatEingabe(quelle); };
const baum = el => Array.isArray(el) ? el.flatMap(baum) : [el, ...(Array.isArray(el?.props?.children) ? el.props.children : [el?.props?.children]).filter(Boolean).flatMap(k => typeof k === "object" ? baum(k) : [])];
beforeEach(() => { h.werte = []; h.refs = []; quelle = new BeispielQuelle(); const d = quelle.lesen();
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
