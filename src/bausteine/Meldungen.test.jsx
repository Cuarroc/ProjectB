import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ToastSpeicher, Toast } from "./Toast";
import { TooltipZeit } from "./Tooltip";

const ms = name => ({ "verzoegerung-tooltip": 600, "fenster-tooltip-wechsel": 400, "standzeit-toast-info": 6000, "dauer-kurz": 120 }[name]);
const meldung = (id, art = "info") => ({ id, art, agent: "Codex", titel: id, zeile: "Meldung", handlung: "Öffnen" });
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it("öffnet nach 600 ms, innerhalb von 400 ms sofort, danach wieder verzögert", () => {
  const zeit = new TooltipZeit(ms), sichtbar = vi.fn();
  zeit.an(sichtbar); vi.advanceTimersByTime(599); expect(sichtbar).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(sichtbar).toHaveBeenLastCalledWith(true, false);
  zeit.zu(); vi.advanceTimersByTime(399); zeit.an(sichtbar); expect(sichtbar).toHaveBeenLastCalledWith(true, true);
  zeit.zu(); sichtbar.mockClear(); vi.advanceTimersByTime(400); zeit.an(sichtbar);
  vi.advanceTimersByTime(599); expect(sichtbar).not.toHaveBeenCalled(); vi.advanceTimersByTime(1); expect(sichtbar).toHaveBeenCalledWith(true, false);
});
it("Esc schließt den Tooltip und verbraucht das Ereignis", () => {
  const zeit = new TooltipZeit(ms), sichtbar = vi.fn(), e = { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() };
  zeit.an(sichtbar); vi.advanceTimersByTime(600); zeit.taste(e);
  expect(sichtbar).toHaveBeenLastCalledWith(false, false); expect(e.preventDefault).toHaveBeenCalled(); expect(e.stopPropagation).toHaveBeenCalled();
});
it("pausiert die Info-Restzeit bei Hover, Fokus und verborgenem Fenster", () => {
  const s = new ToastSpeicher(ms); s.melden(meldung("Export")); vi.advanceTimersByTime(2000);
  s.pause("Export", "hover", true); s.pause("Export", "fokus", true); vi.advanceTimersByTime(9000);
  s.pause("Export", "hover", false); vi.advanceTimersByTime(9000); expect(s.bild().aktiv[0].weg).toBeFalsy();
  s.hintergrund(true); s.pause("Export", "fokus", false); vi.advanceTimersByTime(9000); s.hintergrund(false);
  vi.advanceTimersByTime(3999); expect(s.bild().aktiv[0].weg).toBeFalsy(); vi.advanceTimersByTime(1); expect(s.bild().aktiv[0].weg).toBe(true);
  vi.advanceTimersByTime(120); expect(s.bild().aktiv).toHaveLength(0);
});
it("begrenzt den Stapel auf drei, fasst Infos zusammen und verdrängt keine Fragen oder Probleme", () => {
  const s = new ToastSpeicher(ms); for (const id of ["A", "B", "C", "D"]) s.melden(meldung(id));
  expect(s.bild().aktiv).toHaveLength(3); expect(s.bild().aktiv[0].titel).toBe("2 neue Meldungen");
  for (const id of ["Frage1", "Frage2", "Problem"]) s.melden(meldung(id, id === "Problem" ? "problem" : "wartet"));
  s.melden(meldung("Frage3", "wartet")); expect(s.bild().aktiv.map(x => x.id)).toEqual(["Frage1", "Frage2", "Problem"]);
  expect(s.bild().wartend).toHaveLength(1); s.schliessen("Frage1"); vi.advanceTimersByTime(120); expect(s.bild().aktiv.map(x => x.id)).toEqual(["Frage2", "Problem", "Frage3"]);
});
it("hat anfangs leere Live-Regionen und sagt Agentenmeldungen nur einmal an", () => {
  const s = new ToastSpeicher(ms), html = renderToStaticMarkup(<Toast speicher={s} />);
  expect(html).toContain('aria-live="polite"'); expect(html).toContain('aria-live="assertive"');
  s.melden(meldung("Frage", "wartet")); expect(s.bild().dringend).toBe("Codex: Frage: Meldung");
  const bild = s.bild(); s.melden(meldung("Frage", "wartet")); expect(s.bild()).toBe(bild);
});
it("entfernt bei 0 ms sofort ohne transitionend", () => {
  const s = new ToastSpeicher(name => name === "dauer-kurz" ? 0 : ms(name)); s.melden(meldung("Export")); s.schliessen("Export"); expect(s.bild().aktiv).toHaveLength(0);
});
it("hält Infos hinter drei Fragen zurück und gibt sie erst nach dem Schließen frei", () => {
  const s = new ToastSpeicher(ms); for (const id of ["A", "B", "C"]) s.melden(meldung(id, "wartet")); s.melden(meldung("Info"));
  expect(s.bild().aktiv.map(x => x.id)).toEqual(["A", "B", "C"]); expect(s.bild().wartend).toHaveLength(1);
  s.schliessen("A"); vi.advanceTimersByTime(120); expect(s.bild().aktiv.map(x => x.id)).toEqual(["B", "C", "Info"]);
});
it("bricht einen noch wartenden Tooltip beim Entfernen seines Auslösers ab", () => {
  const zeit = new TooltipZeit(ms), sichtbar = vi.fn(); zeit.an(sichtbar); vi.advanceTimersByTime(599); zeit.zu(sichtbar); vi.advanceTimersByTime(1); expect(sichtbar).not.toHaveBeenCalled();
});
