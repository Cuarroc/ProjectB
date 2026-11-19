import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnhangAblage, useAnhaenge } from "./Anhaenge";
import { ChatEingabeAnsicht } from "../ChatEingabe";
import { BeispielQuelle } from "../../daten/quelle";

const h = vi.hoisted(() => ({ werte: [], refs: [], effekte: [], i: 0, r: 0 }));
vi.mock("react", async original => ({ ...await original(),
  useState: initial => { const i = h.i++; if (!(i in h.werte)) h.werte[i] = initial;
    return [h.werte[i], wert => { h.werte[i] = typeof wert === "function" ? wert(h.werte[i]) : wert; }]; },
  useRef: initial => h.refs[h.r++] ??= { current: initial }, useEffect: fn => h.effekte.push(fn),
}));
let anhaenge, gesperrt, fehler, aufraeumen;
const ansicht = () => {
  aufraeumen.forEach(fn => fn?.()); h.i = 0; h.r = 0; h.effekte = [];
  anhaenge = useAnhaenge(fehler);
  const el = AnhangAblage({ anhaenge, gesperrt, children: <span>Eingabe</span> });
  aufraeumen = h.effekte.map(fn => fn()); return el;
};
const html = () => renderToStaticMarkup(ansicht());
const dateien = [new File(["bild"], "bild.png", { type: "image/png" }), new File(["a,b\nc,d"], "daten.csv", { type: "text/csv" })];
const ereignis = (extra = {}) => ({ preventDefault: vi.fn(), dataTransfer: { types: ["Files"], items: dateien.map(() => ({ kind: "file" })), files: dateien, ...extra } });
beforeEach(() => { h.werte = []; h.refs = []; gesperrt = false; fehler = vi.fn(); aufraeumen = []; vi.stubGlobal("window", new EventTarget()); });
afterEach(() => { aufraeumen.forEach(fn => fn?.()); vi.unstubAllGlobals(); });

it("entfernt den Dateischutz für dragover und drop beim Unmount", () => {
  ansicht();
  const senden = typ => {
    const event = Object.assign(new Event(typ, { cancelable: true }), { dataTransfer: { types: ["Files"], dropEffect: "copy" } });
    window.dispatchEvent(event); return event;
  };
  for (const typ of ["dragover", "drop"]) expect(senden(typ).defaultPrevented).toBe(true);
  aufraeumen.forEach(fn => fn?.()); aufraeumen = [];
  for (const typ of ["dragover", "drop"]) expect(senden(typ).defaultPrevented).toBe(false);
});

it("verbindet die Ablage mit den Anhängen und der Chatsperre", () => {
  ansicht(); const chat = new BeispielQuelle().lesen().chats[0];
  const el = ChatEingabeAnsicht({ chat, modelle: [], text: "", fehler: "", laeuft: true, anhaenge });
  expect(el.type).toBe(AnhangAblage); expect(el.props.anhaenge).toBe(anhaenge); expect(el.props.gesperrt).toBe(true);
});
it("zeigt beim Ziehen zwei Dateien und übernimmt sie in anhaenge.dateien", async () => {
  const e = ereignis(); ansicht().props.onDragEnter(e); expect(e.preventDefault).toHaveBeenCalled();
  expect(html()).toContain("Loslassen zum Anhängen"); expect(html()).toContain("2 Dateien");
  const bewegen = ereignis(); ansicht().props.onDragOver(bewegen); expect(bewegen.preventDefault).toHaveBeenCalled();
  await ansicht().props.onDrop(ereignis());
  expect(html()).not.toContain("Loslassen zum Anhängen"); expect(anhaenge.dateien.map(a => a.datei)).toEqual(dateien);
  await Promise.resolve(); expect(anhaenge.dateien[1].datei).toBe(dateien[1]);
});
it("zeigt bei unbekannter Anzahl keinen Zähler und bei einer Datei die Einzahl", () => {
  ansicht().props.onDragEnter(ereignis({ items: [] })); expect(html()).toContain("Loslassen zum Anhängen"); expect(html()).not.toContain("0 Dateien");
  ansicht().props.onDragOver(ereignis({ items: [{ kind: "file" }] })); expect(html()).toContain("1 Datei"); expect(html()).not.toContain("1 Dateien");
});
it("ignoriert Text beim Ziehen und Loslassen", async () => {
  const e = ereignis({ types: ["text/plain"], items: [{ kind: "string" }], files: [] });
  ansicht().props.onDragEnter(e); ansicht().props.onDragOver(e); await ansicht().props.onDrop(e);
  expect(html()).not.toContain("Loslassen zum Anhängen"); expect(anhaenge.dateien).toEqual([]); expect(e.preventDefault).not.toHaveBeenCalled(); expect(fehler).not.toHaveBeenCalled();
});
it("nimmt gesperrt nichts an und zeigt keine Fläche", async () => {
  gesperrt = true; ansicht().props.onDragEnter(ereignis()); ansicht().props.onDragOver(ereignis());
  await ansicht().props.onDrop(ereignis()); expect(html()).not.toContain("Loslassen zum Anhängen"); expect(anhaenge.dateien).toEqual([]); expect(fehler).not.toHaveBeenCalled();
});
it("entfernt eine offene Fläche auch bei nachträglicher Sperre", () => {
  ansicht().props.onDragEnter(ereignis()); expect(html()).toContain("Loslassen zum Anhängen");
  gesperrt = true; expect(html()).not.toContain("Loslassen zum Anhängen"); gesperrt = false;
  expect(html()).not.toContain("Loslassen zum Anhängen");
});
it("bleibt über Kindelementen sichtbar und verschwindet erst beim Verlassen", () => {
  ansicht().props.onDragEnter(ereignis()); ansicht().props.onDragEnter(ereignis()); ansicht().props.onDragLeave(ereignis());
  expect(html()).toContain("Loslassen zum Anhängen"); ansicht().props.onDragLeave(ereignis()); expect(html()).not.toContain("Loslassen zum Anhängen");
  ansicht().props.onDragLeave(ereignis()); ansicht().props.onDragEnter(ereignis()); expect(html()).toContain("Loslassen zum Anhängen");
});
it("schließt mit Escape auch ohne Fokus in der Eingabe und kann wieder öffnen", () => {
  ansicht().props.onDragEnter(ereignis()); expect(html()).toContain("Loslassen zum Anhängen");
  window.dispatchEvent(Object.assign(new Event("keydown"), { key: "Enter" })); expect(html()).toContain("Loslassen zum Anhängen");
  window.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" })); expect(html()).not.toContain("Loslassen zum Anhängen");
  ansicht().props.onDragEnter(ereignis()); ansicht().props.onDragLeave(ereignis()); expect(html()).not.toContain("Loslassen zum Anhängen");
});
it("verwendet beim Drop dieselben Grenzen und Fehlermeldungen wie Plus", async () => {
  await ansicht().props.onDrop(ereignis({ files: [new File([new Uint8Array(10 * 1024 * 1024 + 1)], "gross.png")] }));
  ansicht(); expect(anhaenge.dateien).toHaveLength(0); expect(fehler).toHaveBeenLastCalledWith("gross.png: höchstens 10 MB je Datei.");
  await ansicht().props.onDrop(ereignis({ files: Array(11).fill(dateien[0]) })); ansicht();
  expect(anhaenge.dateien).toHaveLength(10); expect(fehler).toHaveBeenLastCalledWith("Höchstens 10 Dateien anhängen.");
});
