import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BeispielQuelle } from "../daten/quelle";
import { neuerChat } from "../daten/chats";
import { postfach } from "../daten/postfach";
import { PostfachKnopf } from "./PostfachKnopf";

const h = vi.hoisted(() => ({ offen: false }));
vi.mock("react", async original => ({ ...await original(), useEffect() {}, useLayoutEffect() {},
  useRef: () => ({ current: null }), useId: () => "postfach-test",
  useState: initial => [initial === false ? h.offen : initial, () => {}],
}));
const finden = (node, passt) => !node || typeof node !== "object" ? undefined : passt(node.props) ? node : [node.props?.children].flat(Infinity).map(n => finden(n, passt)).find(Boolean);
const nachricht = (id, aktionen, von = "Orchestrator") => ({ id, von, zeit: "12:00", text: id, aktionen });
let quelle;
beforeEach(() => {
  h.offen = false; quelle = new BeispielQuelle(); const d = quelle.lesen(); d.kopf.geoeffnet = true;
  d.chats = [{ ...neuerChat(), id: "plan", titel: "Export planen", verlauf: [nachricht("p", [{ id: "plan-freigeben" }, { id: "plan-kommentieren" }])] },
    { ...neuerChat(), id: "frage", titel: "Format klären", gestartetUm: "12:00", verlauf: [nachricht("f", [{ id: "antwort-0" }, { id: "antwort-1" }])] }];
  d.aktiverChatId = "plan"; quelle.aktualisieren(d);
});
it("zählt Nachrichten über alle Chats, auch laufende, statt einzelner Aktionen", () => {
  expect(postfach(quelle.lesen()).zahl).toBe(2);
  expect(renderToStaticMarkup(<PostfachKnopf daten={quelle.lesen()} quelle={quelle} />)).toContain("Postfach 2 warten auf dich");
});
it("liefert Plan und Interview mit Chat-Titel als Einträge", () => {
  expect(postfach(quelle.lesen()).eintraege).toEqual([
    { chatId: "plan", nachrichtId: "p", titel: "Export planen", text: "Plan wartet auf Freigabe" },
    { chatId: "frage", nachrichtId: "f", titel: "Format klären", text: "Frage wartet auf Antwort" },
  ]);
});
it.each(["Was möchtest du ändern?", "Ist das richtig?"])("zeigt die freie Interview-Frage: %s", text => {
  const d = quelle.lesen(); const chat = d.chats[1];
  chat.modus = "Interview"; chat.gestartetUm = null;
  chat.verlauf = [nachricht("alt", []), { ...nachricht("frei", []), text }];
  expect(postfach(d)).toEqual({ zahl: 2, eintraege: [
    { chatId: "plan", nachrichtId: "p", titel: "Export planen", text: "Plan wartet auf Freigabe" },
    { chatId: "frage", nachrichtId: "frei", titel: "Format klären", text: "Frage wartet auf Antwort" }] });
});
it("zählt eine wartende Interview-Frage mit Aktionen nur einmal", () => {
  const d = quelle.lesen(); d.chats[1].modus = "Interview"; d.chats[1].gestartetUm = null;
  expect(postfach(d).eintraege.map(e => e.nachrichtId)).toEqual(["p", "f"]);
});
it.each([
  ["  Ist das richtig?  \n", true], ["Zusammenfassung: Ein CSV-Export.", false], ["Limit erreicht", false],
])("zählt freie Interview-Texte nur mit abschließendem Fragezeichen: %s", (text, wartet) => {
  const d = quelle.lesen(); Object.assign(d.chats[1], {
    modus: "Interview", gestartetUm: null, verlauf: [{ ...nachricht("frei", []), text }],
  });
  expect(postfach(d).eintraege.map(e => e.nachrichtId)).toEqual(wartet ? ["p", "frei"] : ["p"]);
});
it.each([
  ["Interview", "12:00", [nachricht("läuft", [])]],
  ["Planen", null, [nachricht("plan", [])]],
  ["Ausführen", null, [nachricht("ausführen", [])]],
  ["Interview", null, [nachricht("frage", []), nachricht("antwort", [], "Du")]],
  ["Interview", null, []],
  ["Interview", null, [{ ...nachricht("fehler", []), text: "Problem: Verbindung fehlt" }]],
  ["Interview", null, [{ ...nachricht("fehler", [{ id: "antwort-0" }]), text: "Problem: Verbindung fehlt" }]],
])("ignoriert nicht wartende Fragen und Probleme (%s, %s, %j)", (modus, gestartetUm, verlauf) => {
  const d = quelle.lesen(); Object.assign(d.chats[1], { modus, gestartetUm, verlauf });
  expect(postfach(d).eintraege.map(e => e.nachrichtId)).toEqual(["p"]);
});
it("ignoriert Nachrichten ohne Aktionen und Nachrichten von dir", () => {
  const d = quelle.lesen(); d.chats[0].verlauf = [nachricht("leer", []), nachricht("du", [{ id: "antwort-0" }], "Du")];
  expect(postfach(d).zahl).toBe(1);
  d.chats[1].verlauf = []; h.offen = true;
  expect(renderToStaticMarkup(<PostfachKnopf daten={d} quelle={quelle} />)).toContain("Nichts wartet auf dich.");
});
it("behält ohne geöffnetes Projekt die Beispielzahl", () => {
  const d = quelle.lesen(); d.kopf.geoeffnet = false;
  expect(postfach(d)).toEqual({ zahl: d.kopf.postfach, eintraege: [] });
});
it("öffnet beim Klick auf den Interview-Eintrag dessen laufenden Chat", () => {
  h.offen = true; const ansicht = PostfachKnopf({ daten: quelle.lesen(), quelle });
  finden(ansicht, p => p.className === "postfach-eintrag" && p.children[1].props.children === "Format klären").props.onClick();
  expect(quelle.lesen().aktiverChatId).toBe("frage");
});
