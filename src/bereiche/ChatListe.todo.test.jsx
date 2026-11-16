import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChatListe from "./ChatListe";
import { BeispielQuelle } from "../daten/quelle";
import { neuerChat } from "../daten/chats";

const h = vi.hoisted(() => ({ werte: [], i: 0 }));
vi.mock("react", async original => ({ ...await original(),
  useEffect: () => {},
  useState: initial => { const i = h.i++; return [h.werte[i] ?? (typeof initial === "function" ? initial() : initial), wert => { h.werte[i] = wert; }]; },
}));
const finden = (node, passt) => !node || typeof node !== "object" ? undefined : passt(node.props) ? node : [node.props?.children].flat(Infinity).map(n => finden(n, passt)).find(Boolean);
it("zeigt und ändert nur Aufgaben des aktiven Chats, ohne Beispiel-Todos im Projekt", () => {
  const quelle = new BeispielQuelle(), d = quelle.lesen(); d.kopf.geoeffnet = true;
  d.chats = [neuerChat(), neuerChat()]; d.aktiverChatId = d.chats[1].id; quelle.aktualisieren(d);
  const ansicht = () => { h.i = 0; h.werte[0] = quelle.lesen(); return ChatListe({ quelle, offen: true, umschalten() {} }); };
  expect(renderToStaticMarkup(ansicht())).toContain("Noch keine Aufgaben.");
  expect(renderToStaticMarkup(ansicht())).not.toContain("CSV-Export fertigstellen");
  finden(ansicht(), p => p["aria-label"] === "Aufgabe hinzufügen").props.onChange({ target: { value: "Eigene Aufgabe" } });
  finden(ansicht(), p => p.className === "rand-form").props.onSubmit({ preventDefault() {} });
  const todos = quelle.lesen().chats[1].todos;
  expect(todos).toEqual([expect.objectContaining({ text: "Eigene Aufgabe", fertig: false, von: "Du" })]);
  finden(ansicht(), p => p.type === "checkbox").props.onChange();
  expect(quelle.lesen().chats[1].todos[0].fertig).toBe(true);
  expect(quelle.lesen().chats[0].todos ?? []).toEqual([]);
  const neu = quelle.lesen(); neu.aktiverChatId = neu.chats[0].id; quelle.aktualisieren(neu);
  expect(renderToStaticMarkup(ansicht())).not.toContain("Eigene Aufgabe");
  const voll = quelle.lesen(); voll.chats[0].todos = Array.from({ length: 20 }, (_, i) => ({ id: String(i), text: `Aufgabe ${i}`, fertig: false })); quelle.aktualisieren(voll);
  expect(finden(ansicht(), p => p.text === "Aufgabe hinzufügen").props.disabled).toBe(true);
});
