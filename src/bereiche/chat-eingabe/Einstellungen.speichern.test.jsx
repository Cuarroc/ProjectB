import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Children, isValidElement } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Einstellungen } from "./Einstellungen";
import { chatEingabeQuelle as quelle } from "../ChatEingabe";
import { Umschalter } from "../../bausteine/Umschalter";
const h = vi.hoisted(() => ({ werte: [], refs: [], effekte: [], jetzt: [], i: 0, r: 0, e: 0 }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("../ChatEingabe", async () => ({ chatEingabeQuelle: new (await import("../../daten/quelle")).BeispielQuelle() }));
vi.mock("react", async original => ({ ...await original(), useId: () => "einstellungen", useLayoutEffect: () => {},
  useState: initial => { const i = h.i++; if (!(i in h.werte)) h.werte[i] = initial;
    return [h.werte[i], neu => { h.werte[i] = typeof neu === "function" ? neu(h.werte[i]) : neu; }]; },
  useRef: initial => h.refs[h.r++] ?? (h.refs[h.r - 1] = { current: initial }),
  useEffect: (fn, deps) => { const i = h.e++, alt = h.effekte[i];
    if (!alt || deps.some((d, n) => d !== alt.deps[n])) h.jetzt.push(() => { alt?.ab?.(); h.effekte[i] = { deps, ab: fn() }; }); },
}));
const pfad = name => { const daten = quelle.lesen(); daten.kopf.pfad = name; quelle.aktualisieren(daten); };
const finde = (el, passt) => isValidElement(el) ? (passt(el) ? el : Children.toArray(el.props.children).map(k => finde(k, passt)).find(Boolean)) : undefined;
const render = () => { h.i = h.r = h.e = 0; h.jetzt = []; const el = Einstellungen({ modus: "Ausführen" }); h.jetzt.forEach(fn => fn()); return el; };
const knopf = el => finde(el, e => e.type === "button" && e.props["aria-haspopup"]);
const feld = () => finde(render(), e => e.type === Umschalter);
const leeren = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const warten = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
beforeEach(() => { vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "6000ms" })); vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn() }); h.werte = []; h.refs = []; h.effekte = []; vi.mocked(invoke).mockReset(); pfad("A"); });
afterEach(() => { h.effekte.forEach(e => e.ab?.()); vi.unstubAllGlobals(); });
it("lädt je Projekt, sendet ein Feld, zeigt die Kernantwort und springt bei Fehler zurück", async () => {
  vi.mocked(invoke).mockResolvedValue({ ausfuehren: { agentenGleichzeitig: "einer" } });
  render(); await leeren(); knopf(render()).props.onClick();
  expect(feld().props.wert).toBe("1");
  vi.mocked(invoke).mockResolvedValueOnce({ ausfuehren: { agentenGleichzeitig: "bisZu3" } });
  feld().props.onChange("Bis zu 5"); await leeren();
  expect(invoke).toHaveBeenLastCalledWith("einstellungen_speichern", { projekt: "A", werte: { ausfuehren: { agentenGleichzeitig: "bisZu5" } } });
  expect(feld().props.wert).toBe("Bis zu 3");
  vi.mocked(invoke).mockRejectedValueOnce("Kein Zugriff");
  feld().props.onChange("1"); expect(feld().props.wert).toBe("1"); await leeren();
  expect(feld().props.wert).toBe("Bis zu 3");
  expect(finde(render(), e => e.props.role === "status").props.children.join(" ")).toContain("Nicht gespeichert: Kein Zugriff");
  pfad("B"); await leeren();
  expect(invoke).toHaveBeenLastCalledWith("einstellungen_laden", { projekt: "B" });
  expect(feld().props.wert).toBe("1");
});
it.each(["resolve", "reject"])("verwirft alte Antworten (%s) auch nach Abbau und serialisiert Änderungen", async ergebnis => {
  const alt = warten(), speichern = warten(), neu = warten();
  vi.mocked(invoke).mockReturnValueOnce(alt.promise).mockResolvedValueOnce({});
  render(); pfad("B"); await leeren(); alt[ergebnis]({ ausfuehren: { agentenGleichzeitig: "einer" } }); await leeren();
  knopf(render()).props.onClick(); expect(feld().props.wert).toBe("Bis zu 3");
  vi.mocked(invoke).mockReturnValueOnce(speichern.promise).mockResolvedValueOnce({ ausfuehren: { agentenGleichzeitig: "einer" } });
  feld().props.onChange("Bis zu 5"); feld().props.onChange("1"); await leeren();
  expect(invoke.mock.calls.filter(c => c[0] === "einstellungen_speichern")).toHaveLength(1);
  speichern.resolve({ ausfuehren: { agentenGleichzeitig: "bisZu5" } }); await leeren();
  expect(feld().props.wert).toBe("1");
  vi.mocked(invoke).mockReturnValueOnce(neu.promise).mockResolvedValueOnce({});
  feld().props.onChange("Bis zu 5"); await leeren(); pfad("C"); await leeren();
  neu[ergebnis]({ ausfuehren: { agentenGleichzeitig: "einer" } }); await leeren(); expect(feld().props.wert).toBe("Bis zu 3");
  const abbau = warten(); vi.mocked(invoke).mockReturnValueOnce(abbau.promise);
  feld().props.onChange("1"); await leeren(); h.effekte.forEach(e => e.ab?.()); const stand = [...h.werte];
  abbau[ergebnis]({ ausfuehren: { agentenGleichzeitig: "einer" } }); await leeren(); expect(h.werte).toEqual(stand);
});
it("setzt nur den aktiven Modus zurück und behält unbehobene Speicherfehler", async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(invoke).mockResolvedValue({ ausfuehren: { agentenGleichzeitig: "einer" }, planen: { plan: "kurz" } });
    render(); await leeren(); knopf(render()).props.onClick();
    finde(render(), e => e.type === "button" && e.props.disabled === false).props.onClick(); await leeren();
    expect(invoke).toHaveBeenLastCalledWith("einstellungen_speichern", { projekt: "A", werte: { ausfuehren: { agentenGleichzeitig: "bisZu3", pruefungDurch: "andereModellfamilie", pruefrundenHoechstens: "drei" } } });
    vi.mocked(invoke).mockRejectedValueOnce("Kein Zugriff"); feld().props.onChange("Bis zu 5"); await leeren(); render();
    expect(finde(render(), e => e.props.role === "status")).toBeDefined();
    vi.advanceTimersByTime(6000); expect(finde(render(), e => e.props.role === "status")).toBeDefined();
  } finally { vi.useRealTimers(); }
});
it.each(["Laden", "Speichern"])("speichert vorgemerkte Änderungen trotz Projektwechsel während %s", async phase => {
  const block = warten(); let daten = {}, erstesLaden = true;
  vi.mocked(invoke).mockImplementation(async (cmd, { projekt, werte }) => {
    if (cmd === "einstellungen_laden") { if (projekt === "A" && erstesLaden) { erstesLaden = false; if (phase === "Laden") await block.promise; } return projekt === "A" ? daten : {}; }
    if (phase === "Speichern") await block.promise;
    daten = { ausfuehren: { ...daten.ausfuehren, ...werte.ausfuehren } }; return daten;
  });
  render(); if (phase === "Speichern") await leeren(); knopf(render()).props.onClick();
  feld().props.onChange("Bis zu 5"); feld().props.onChange("1"); await leeren(); pfad("B"); await leeren();
  block.resolve(); await leeren(); expect(feld().props.wert).toBe("Bis zu 3");
  expect(invoke.mock.calls.filter(c => c[0] === "einstellungen_speichern").map(c => c[1].projekt)).toEqual(["A", "A"]);
  pfad("A"); await leeren(); expect(feld().props.wert).toBe("1");
});
it("behält Speicherfehler auch nach Projektwechsel bis genau dieses Feld erfolgreich gespeichert wird", async () => {
  const erster = warten(), zweiter = warten(), status = () => finde(render(), e => e.props.role === "status");
  const pruefung = () => finde(render(), e => e.type === Umschalter && e.props.beschriftung === "Prüfung durch");
  vi.mocked(invoke).mockResolvedValue({}); render(); await leeren(); knopf(render()).props.onClick();
  vi.mocked(invoke).mockReturnValueOnce(erster.promise).mockReturnValueOnce(zweiter.promise);
  feld().props.onChange("Bis zu 5"); pruefung().props.onChange("Gleiche Familie"); await leeren();
  erster.reject("Kein Zugriff"); await leeren();
  expect(status()?.props.children.join(" ")).toContain("Nicht gespeichert: Kein Zugriff");
  expect(feld().props.wert).toBe("Bis zu 3"); expect(pruefung().props.wert).toBe("Gleiche Familie");
  zweiter.resolve({ ausfuehren: { pruefungDurch: "gleicheFamilie" } }); await leeren();
  expect(feld().props.wert).toBe("Bis zu 3"); expect(status()).toBeDefined();
  feld().props.onChange("1"); await leeren(); expect(status()).toBeUndefined();
  const spaet = warten(); vi.mocked(invoke).mockResolvedValue({ ausfuehren: { agentenGleichzeitig: "einer" } }).mockReturnValueOnce(spaet.promise);
  feld().props.onChange("Bis zu 5"); await leeren(); pfad("B"); await leeren();
  spaet.reject("Projekt A gesperrt"); await leeren(); expect(status()).toBeUndefined();
  pfad("A"); await leeren(); expect(feld().props.wert).toBe("1");
  expect(status()?.props.children.join(" ")).toContain("Nicht gespeichert: Projekt A gesperrt");
});
