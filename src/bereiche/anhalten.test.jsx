import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { allesAnhalten, AnhalteKnopf } from "./anhalten";
import Kopf from "./Kopf";
import Team from "./Team";
import ChatVerlauf from "./ChatVerlauf";
import { BeispielQuelle } from "../daten/quelle";
import { beobachteFragen, frageTon, leiserTon } from "./fragenHinweise";

afterEach(() => { allesAnhalten.setzen(false); frageTon.setzen(true); });
describe("Alles anhalten", () => {
  it("hält Kopf, Team und Chat gemeinsam an und setzt sie mit einem Klick fort", () => {
    const abo = vi.fn(), abmelden = allesAnhalten.abonnieren(abo);
    const anzeigen = () => [Kopf, Team, ChatVerlauf].map(Komponente => renderToStaticMarkup(<Komponente />));
    const vorher = anzeigen();
    AnhalteKnopf({ pause: false }).props.onClick();
    expect(allesAnhalten.lesen()).toBe(true);
    for (const html of anzeigen()) { expect(html).toContain("Angehalten"); expect(html).toContain("Weitermachen"); }
    expect(anzeigen()[1]).toContain("Angehalten. Weiter mit Weitermachen.");
    AnhalteKnopf({ pause: true }).props.onClick();
    expect(allesAnhalten.lesen()).toBe(false); expect(anzeigen()).toEqual(vorher);
    expect(abo).toHaveBeenCalledTimes(2); abmelden();
  });
});
describe("Fragenhinweise", () => {
  it("spielt einen kurzen Ton mit höchstens 2,5 Prozent Amplitude", () => {
    const gain = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
    const welle = { frequency: {}, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const audio = { currentTime: 10, createOscillator: () => welle, createGain: () => ({ gain, connect: vi.fn() }), close: vi.fn() };
    leiserTon(class { constructor() { return audio; } });
    expect(gain.linearRampToValueAtTime.mock.calls).toEqual([[0.025, 10.02], [0, 10.18]]);
    expect(welle.stop).toHaveBeenCalledWith(10.2); welle.onended(); expect(audio.close).toHaveBeenCalledOnce();
  });
  it.each([true, false])("meldet jede neue Frage genau einmal, Fokus=%s", fokus => {
    const quelle = new BeispielQuelle(), melden = vi.fn(), ton = vi.fn();
    const abmelden = beobachteFragen(quelle, { melden, ton }, () => fokus);
    const daten = quelle.lesen(); quelle.aktualisieren(daten);
    expect(melden).not.toHaveBeenCalled();
    const frage = { ...daten.fragen[0], id: "neue-frage" }; daten.fragen.push(frage);
    quelle.aktualisieren(daten); quelle.aktualisieren(daten);
    expect(melden).toHaveBeenCalledTimes(fokus ? 0 : 1); expect(ton).toHaveBeenCalledTimes(fokus ? 0 : 1);
    if (!fokus) expect(melden).toHaveBeenCalledWith(frage);
    daten.fragen = []; quelle.aktualisieren(daten); daten.fragen = [frage]; quelle.aktualisieren(daten);
    expect(melden).toHaveBeenCalledTimes(fokus ? 0 : 1);
    abmelden(); daten.fragen.push({ ...frage, id: "nach-abbestellen" }); quelle.aktualisieren(daten);
    expect(melden).toHaveBeenCalledTimes(fokus ? 0 : 1);
  });
  it("meldet mit ausgeschaltetem Ton stumm und bei erneutem Einschalten hörbar", () => {
    const quelle = new BeispielQuelle(), melden = vi.fn(), ton = vi.fn();
    const abmelden = beobachteFragen(quelle, { melden, ton }, () => false), daten = quelle.lesen();
    frageTon.setzen(false); daten.fragen.push({ ...daten.fragen[0], id: "stumm" }); quelle.aktualisieren(daten);
    expect(melden).toHaveBeenCalledTimes(1); expect(ton).not.toHaveBeenCalled();
    frageTon.setzen(true); daten.fragen.push({ ...daten.fragen[0], id: "hoerbar" }); quelle.aktualisieren(daten);
    expect(melden).toHaveBeenCalledTimes(2); expect(ton).toHaveBeenCalledTimes(1); abmelden();
  });
});
