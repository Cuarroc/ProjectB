import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Children } from "react";
import { Umschalter } from "../bausteine/Umschalter";
import { TeamBoard, TeamZeitstrahl } from "./TeamAnsichten";
import { BeispielQuelle } from "../daten/quelle";
import { TeamAnsicht } from "./Team";

const { fokus } = vi.hoisted(() => ({ fokus: [vi.fn(), vi.fn(), vi.fn()] }));
vi.mock("react", async original => ({ ...await original(), useLayoutEffect: () => {},
  useRef: () => ({ current: { querySelectorAll: () => fokus.map(focus => ({ focus })) } }) }));
const daten = new BeispielQuelle().lesen();
const props = { daten, agenten: daten.agenten, waehlen: vi.fn() };

describe("Team-Ansichten", () => {
  it("schaltet die drei Ansichten mit Pfeilen, Pos1 und Ende und setzt den Fokus", () => {
    let wert = "Karten";
    for (const [key, ziel] of [["ArrowRight", "Board"], ["ArrowDown", "Zeitstrahl"], ["ArrowRight", "Karten"], ["ArrowLeft", "Zeitstrahl"], ["Home", "Karten"], ["End", "Zeitstrahl"]]) {
      fokus.forEach(fn => fn.mockClear());
      const teile = Children.toArray(Umschalter({ moeglichkeiten: ["Karten", "Board", "Zeitstrahl"], wert, beschriftung: "Team-Ansicht", onChange: neu => { wert = neu; } }).props.children).filter(el => el.type === "button");
      const gewaehlt = teile.find(el => el.props["aria-checked"]);
      expect(gewaehlt.props.tabIndex).toBe(0);
      expect(teile.filter(el => el.props.tabIndex === 0)).toHaveLength(1);
      const event = { key, preventDefault: vi.fn() }; gewaehlt.props.onKeyDown(event);
      expect(wert).toBe(ziel); expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(fokus[["Karten", "Board", "Zeitstrahl"].indexOf(ziel)]).toHaveBeenCalledOnce();
    }
  });
  it("zeigt die vier Board-Felder und erhält Problem mit Wort und Symbol", () => {
    const html = renderToStaticMarkup(<TeamBoard {...props} agenten={[{ ...daten.agenten[0], zustand: "Problem" }]} />);
    for (const wort of ["Wartet", "Arbeitet", "Offen", "Fertig", "Problem"]) expect(html).toContain(wort);
    expect(html).toMatch(/data-zustand="problem"[^]*?<svg/);
    expect(html).toContain("Gesamtergebnis prüfen");
  });
  it("zeigt die Antwortknöpfe der offenen Frage im Board", () => {
    const html = renderToStaticMarkup(<TeamBoard {...props} />);
    for (const text of daten.fragen[0].antwortknoepfe.map(a => a.text)) expect(html).toContain(text);
    expect(html).toContain('aria-pressed="false"');
  });
  it("verdrahtet Board, Symbole und Umschalten in der Team-Ansicht", () => {
    const umschalten = vi.fn(), ansicht = TeamAnsicht({ ...props, auswahl: null, aendern: vi.fn(), ansicht: "Board", umschalten });
    const schalter = Children.toArray(ansicht.props.children)[0].props.children.find(el => el.type === Umschalter);
    expect(schalter.props.symbole).toHaveLength(3); schalter.props.onChange("Zeitstrahl"); expect(umschalten).toHaveBeenCalledWith("Zeitstrahl");
    expect(renderToStaticMarkup(ansicht)).toContain('class="team-board"');
  });
  it("zeigt bei vollständig fertigen Agenten keinen angehaltenen Orchestrator", () => {
    const agenten = daten.agenten.map(a => ({ ...a, zustand: "Fertig" }));
    for (const Ansicht of [TeamBoard, TeamZeitstrahl]) expect(renderToStaticMarkup(<Ansicht {...props} agenten={agenten} />).match(/data-agent="orchestrator"[^]*?data-zustand="(.*?)"/)[1]).toBe("arbeitet");
  });
  it("benennt beide Achsen, Reihenwerte, Phasendauern und jeden Zustand", () => {
    const html = renderToStaticMarkup(<TeamZeitstrahl {...props} />);
    for (const text of ["Tokens pro 30 s", "In Tausend (k)", "40k", "14:30", "14:40", "Agenten", "245k", "Orchestrator", "113k", "358k", "Legende mit Dauern", "9:15 min", "4:52 min", "6:02 min", "Wartet auf dich", "1:12 min", "Fertig", "Arbeitet", "Schätzung"]) expect(html).toContain(text);
    expect(html).toMatch(/data-zustand="wartet"[^]*?<svg/);
    const geaendert = renderToStaticMarkup(<TeamZeitstrahl {...props} agenten={daten.agenten.map(a => ({ ...a, tokens: 1000 }))} />);
    expect(geaendert).toContain("116k");
  });
});
