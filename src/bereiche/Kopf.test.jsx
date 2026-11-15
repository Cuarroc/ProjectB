import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Kopf, { ProjektWahl, bewegungSetzen, bewegungAktuell } from "./Kopf";
import { Children } from "react";
import { isTauri } from "@tauri-apps/api/core";
// Kontingent wird wie die Projektbefehle über die Datenbrücke geprüft.
import { kontingentLesen, projektOeffnen, projektPruefen, projekteZuletzt } from "../daten/tauri";
import { chatEingabeQuelle } from "./ChatEingabe";

describe("Kopf", () => {
  it.each(["auto", "voll", "reduziert"])("setzt %s am äußersten Element und folgt bei Automatisch Windows", wahl => {
    const wurzel = { dataset: {} }; bewegungSetzen(wahl, wurzel);
    expect(wurzel.dataset.bewegung).toBe(wahl);
    expect(bewegungAktuell(wahl, true)).toBe(wahl === "auto" ? "reduziert" : wahl);
    expect(bewegungAktuell(wahl, false)).toBe(wahl === "auto" ? "voll" : wahl);
  });
  it("zeigt Kontingent mit Zahlen, Genutzt und benannter Soll-Marke", () => {
    const html = renderToStaticMarkup(<Kopf />);
    for (const text of ["Claude", "Codex", "42", "51", "Genutzt", "Soll 48 %", "kopf-soll"]) expect(html).toContain(text);
  });
  it("zeigt die benannte Berechtigung mit zwei von vier aktiven Stufenbalken", () => {
    const html = renderToStaticMarkup(<Kopf />); expect(html).toContain("Berechtigungen: Nur bei Wichtigem");
    expect(html.match(/data-an="true"/g)).toHaveLength(2); expect(html.match(/data-an="false"/g)).toHaveLength(2);
  });
  // Getrennte Soll-Marken dürfen beim Wechsel der Datenquelle nicht zusammenfallen.
  it("liest geänderte Kontingente aus derselben Quelle wie der Chat", () => {
    const vorher = chatEingabeQuelle.lesen(), neu = structuredClone(vorher); neu.kopf.kontingent = { claude: { genutzt: 17, soll: 57 }, codex: { genutzt: 86, soll: 63 } };
    try { chatEingabeQuelle.aktualisieren(neu); const html = renderToStaticMarkup(<Kopf />);
      expect(html).toContain("Genutzt 17 %, Soll 57 %"); expect(html).toContain("Genutzt 86 %, Soll 63 %");
      expect(html).toContain('class="kopf-soll" style="left:57%"');
      expect(html).toContain('class="kopf-soll" style="left:63%"');
      expect(html).toContain("Weiße Marke: Soll"); expect(html).not.toContain("Soll 48 %");
    } finally { chatEingabeQuelle.aktualisieren(vorher); }
  });
});

const hooks = vi.hoisted(() => ({ aktiv: false, werte: [], index: 0, effekte: [] }));
// Desktop-Start und Browser-Verhalten brauchen getrennte Antworten.
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => false) }));
// Die neue Verbrauchsabfrage bleibt von Projektantworten getrennt.
vi.mock("../daten/tauri", () => ({ kontingentLesen: vi.fn(), projektOeffnen: vi.fn(), projektPruefen: vi.fn(), projekteZuletzt: vi.fn() }));
vi.mock("react", async original => {
  const react = await original();
  return { ...react, useEffect: (...args) => { if (!hooks.aktiv) return react.useEffect(...args); hooks.effekte.push(args[0]); },
    useRef: (...args) => hooks.aktiv ? (hooks.werte[hooks.index++] ??= { current: args[0] }) : react.useRef(...args),
    useState: (...args) => {
      if (!hooks.aktiv) return react.useState(...args);
      // Kopf initialisiert seine Daten verzögert wie echtes React.
      const i = hooks.index++; if (!(i in hooks.werte)) hooks.werte[i] = typeof args[0] === "function" ? args[0]() : args[0];
      return [hooks.werte[i], wert => { hooks.werte[i] = wert; }];
    } };
});
const vorher = chatEingabeQuelle.lesen();
// Desktop-Mocks und Kontingent-Timer dürfen spätere Tests nicht beeinflussen.
afterEach(() => { vi.useRealTimers(); hooks.aktiv = false; hooks.werte = []; hooks.effekte = []; vi.resetAllMocks(); vi.mocked(isTauri).mockReturnValue(false); chatEingabeQuelle.aktualisieren(vorher); });
const auswahl = () => {
  hooks.aktiv = true; hooks.index = 0;
  const menue = ProjektWahl({ kopf: chatEingabeQuelle.lesen().kopf });
  hooks.aktiv = false;
  const zu = vi.fn(), teile = Children.toArray(menue.props.children(zu).props.children);
  return { menue, zu, inhalt: teile[1] };
};
const formular = pfad => {
  const liste = auswahl(); Children.toArray(liste.inhalt.props.children).at(-1).props.onClick();
  const form = auswahl().inhalt; form.props.children[1].props.onChange({ target: { value: pfad } });
  return auswahl();
};
const fertig = async () => { await Promise.resolve(); await Promise.resolve(); };

it.each(["Liste", "Formular"])("sperrt Projektwechsel über %s bis alle Chats fertig sind", async weg => {
  const projekt = { projekt: "Beispiel", pfad: vorher.kopf.projekte[1], zweig: "testen" };
  vi.mocked(projektOeffnen).mockResolvedValue(projekt); vi.mocked(projekteZuletzt).mockResolvedValue([projekt.pfad]);
  const ausloesen = () => { const { inhalt } = weg === "Liste" || auswahl().menue.props.formular ? auswahl() : formular(projekt.pfad);
    if (weg === "Liste") inhalt.props.children[0].props.children[1].props.onClick();
    else inhalt.props.onSubmit({ preventDefault: vi.fn() }); };
  const d = chatEingabeQuelle.lesen(); d.kopf = { ...d.kopf, geoeffnet: true }; d.chats.forEach(c => { c.gestartetUm = null; }); d.chats.push({ ...d.chats[0], id: "laufend", gestartetUm: "12:00" }); chatEingabeQuelle.aktualisieren(d);
  ausloesen(); await fertig();
  expect(projektOeffnen).not.toHaveBeenCalled(); expect(projekteZuletzt).not.toHaveBeenCalled();
  expect(chatEingabeQuelle.lesen().kopf).toEqual(d.kopf);
  expect(renderToStaticMarkup(auswahl().inhalt)).toContain("Ein Auftrag läuft noch. Wechsle das Projekt, wenn er fertig ist.");
  d.chats[1].gestartetUm = null; chatEingabeQuelle.aktualisieren(d); ausloesen(); await fertig();
  expect(projektOeffnen).toHaveBeenCalledExactlyOnceWith(projekt.pfad); expect(chatEingabeQuelle.lesen().kopf.pfad).toBe(projekt.pfad);
});

it("übernimmt kein Projekt, wenn während des Öffnens ein Auftrag startet", async () => {
  let fertigOeffnen; vi.mocked(projektOeffnen).mockReturnValue(new Promise(r => { fertigOeffnen = r; })); const d = chatEingabeQuelle.lesen();
  d.kopf = { ...d.kopf, geoeffnet: true }; d.chats.forEach(c => { c.gestartetUm = null; }); chatEingabeQuelle.aktualisieren(d); auswahl().inhalt.props.children[0].props.children[1].props.onClick(); await fertig();
  d.chats[0].gestartetUm = "12:00"; chatEingabeQuelle.aktualisieren(d); fertigOeffnen({ projekt: "Beispiel", pfad: vorher.kopf.projekte[1], zweig: "testen" }); await fertig();
  expect(chatEingabeQuelle.lesen().kopf.pfad).toBe(d.kopf.pfad); expect(renderToStaticMarkup(auswahl().inhalt)).toContain("Ein Auftrag läuft noch. Wechsle das Projekt, wenn er fertig ist.");
});
it("sperrt das erste Öffnen nicht wegen eines Beispiel-Laufs", async () => {
  vi.mocked(projektOeffnen).mockResolvedValue({ projekt: "Beispiel", pfad: vorher.kopf.projekte[1], zweig: "testen" });
  const d = chatEingabeQuelle.lesen(); d.kopf = { ...d.kopf, geoeffnet: false }; d.chats[0].gestartetUm = "14:30"; chatEingabeQuelle.aktualisieren(d);
  auswahl().inhalt.props.children[0].props.children[1].props.onClick(); await fertig(); expect(projektOeffnen).toHaveBeenCalledExactlyOnceWith(vorher.kopf.projekte[1]);
});
it("öffnet per Formular und setzt Projektname, Pfad, Zweig und die letzte Liste im Kopf", async () => {
  const projekt = { projekt: "Unser Garten", pfad: "D:\\Arbeit\\Garten", zweig: "blumen" };
  vi.mocked(projektOeffnen).mockResolvedValue(projekt);
  // Das Formular muss nach Erfolg die gespeicherte Liste nachladen.
  vi.mocked(projekteZuletzt).mockResolvedValue([projekt.pfad, ...vorher.kopf.projekte]);
  const { inhalt, zu } = formular(` ${projekt.pfad} `);
  inhalt.props.onSubmit({ preventDefault: vi.fn() }); inhalt.props.onSubmit({ preventDefault: vi.fn() }); await fertig();
  expect(projektOeffnen).toHaveBeenCalledExactlyOnceWith(projekt.pfad); expect(zu).toHaveBeenCalledOnce();
  expect(projekteZuletzt).toHaveBeenCalledOnce();
  expect(chatEingabeQuelle.lesen().kopf).toMatchObject({ ...projekt, geoeffnet: true, projekte: [projekt.pfad, ...vorher.kopf.projekte] });
  const html = renderToStaticMarkup(<Kopf />);
  for (const text of Object.values(projekt)) expect(html).toContain(text);
  expect(html).toContain(">Unser Garten</span>");
});
it.each([new Error("Der Ordner ist kein Git-Projekt."), "Der Ordner ist nicht erreichbar."])("zeigt den deutschen Fehler am unveränderten Feld: %s", async fehler => {
  vi.mocked(projektOeffnen).mockRejectedValue(fehler);
  const { inhalt, zu } = formular("D:\\Fehlt"); inhalt.props.onSubmit({ preventDefault: vi.fn() }); await fertig();
  const html = renderToStaticMarkup(auswahl().inhalt);
  expect(html).toContain('aria-invalid="true"'); expect(html).toContain('aria-describedby="projekt-fehler"');
  expect(html).toMatch(/id="projekt-fehler"[^]*?<svg[^]*?Der Ordner/); expect(html).toContain('value="D:\\Fehlt"');
  expect(zu).not.toHaveBeenCalled(); expect(chatEingabeQuelle.lesen().kopf).toEqual(vorher.kopf);
});
it("öffnet einen Listeneintrag und übernimmt die neu geladene Liste", async () => {
  const projekt = { projekt: "Beispiel", pfad: vorher.kopf.projekte[1], zweig: "testen" };
  vi.mocked(projektOeffnen).mockResolvedValue(projekt);
  // Der zusätzliche Pfad unterscheidet Nachladen von bloßem lokalem Umsortieren.
  const projekte = [projekt.pfad, "D:\\Weiteres-Projekt", vorher.kopf.pfad];
  vi.mocked(projekteZuletzt).mockResolvedValue(projekte);
  const { inhalt, zu } = auswahl(); inhalt.props.children[0].props.children[1].props.onClick(); await fertig();
  expect(projektOeffnen).toHaveBeenCalledExactlyOnceWith(projekt.pfad); expect(zu).toHaveBeenCalledOnce();
  expect(projekteZuletzt).toHaveBeenCalledOnce();
  expect(chatEingabeQuelle.lesen().kopf).toMatchObject({ ...projekt, projekte });
});

// Ein Fehler beim Nachladen darf das bereits erfolgreiche Öffnen nicht als gescheitert melden.
it("behält bei Ladefehler das geöffnete Projekt und meldet nur den Listenfehler", async () => {
  const projekt = { projekt: "Beispiel", pfad: vorher.kopf.projekte[1], zweig: "testen" };
  vi.mocked(projektOeffnen).mockResolvedValue(projekt);
  vi.mocked(projekteZuletzt).mockRejectedValue(new Error("Nicht erreichbar"));
  const { inhalt, zu } = auswahl(); inhalt.props.children[0].props.children[1].props.onClick(); await fertig();
  expect(zu).toHaveBeenCalledOnce(); expect(auswahl().menue.props.formular).toBe(false);
  expect(chatEingabeQuelle.lesen().kopf).toMatchObject({ ...projekt, projekte: [projekt.pfad, vorher.kopf.pfad] });
  expect(renderToStaticMarkup(auswahl().inhalt)).toContain("Zuletzt geöffnete Projekte konnten nicht geladen werden.");
});

it("lädt zuletzt geöffnete Projekte und lässt eine späte Antwort kein neu geöffnetes Projekt verdrängen", async () => {
  // Die alte Startantwort darf die nach dem Öffnen neu geladene Liste nicht verdrängen.
  let antwort; vi.mocked(projekteZuletzt).mockReturnValueOnce(new Promise(resolve => { antwort = resolve; }));
  const { inhalt } = auswahl(), aufraeumen = hooks.effekte[0]();
  const projekt = { projekt: "Beispiel", pfad: vorher.kopf.projekte[1], zweig: "neu" };
  vi.mocked(projektOeffnen).mockResolvedValue(projekt);
  vi.mocked(projekteZuletzt).mockResolvedValue([projekt.pfad, vorher.kopf.pfad]);
  inhalt.props.children[0].props.children[1].props.onClick(); await fertig();
  antwort([vorher.kopf.pfad]); await fertig(); aufraeumen();
  expect(projekteZuletzt).toHaveBeenCalledTimes(2); expect(chatEingabeQuelle.lesen().kopf.projekte[0]).toBe(projekt.pfad);
});

it.each([[], ["D:\\Arbeit\\Garten"]])("übernimmt projekteZuletzt: %j", async projekte => {
  vi.mocked(projekteZuletzt).mockResolvedValue(projekte); auswahl();
  const aufraeumen = hooks.effekte[0](); await fertig(); aufraeumen();
  expect(chatEingabeQuelle.lesen().kopf.projekte).toEqual(projekte);
});

it("zeigt beim Desktop-Start das erste gemerkte Projekt mit Pfad und Zweig", async () => {
  const projekt = { projekt: "ProjectB-Handbuch", pfad: "C:\\ProjectB-Handbuch", zweig: "handbuch" };
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(projekteZuletzt).mockResolvedValue([projekt.pfad, vorher.kopf.pfad]);
  vi.mocked(projektPruefen).mockResolvedValue(projekt);
  auswahl(); const aufraeumen = hooks.effekte[0](); await fertig(); aufraeumen();
  expect(projektPruefen).toHaveBeenCalledExactlyOnceWith(projekt.pfad);
  expect(projektOeffnen).not.toHaveBeenCalled();
  expect(chatEingabeQuelle.lesen().kopf.geoeffnet).toBe(true);
  expect(chatEingabeQuelle.lesen().kopf.projekte).toEqual([projekt.pfad, vorher.kopf.pfad]);
  const html = renderToStaticMarkup(<Kopf />);
  expect(html).toContain(`aria-label="Projekt wählen: ${projekt.projekt} ${projekt.pfad} ${projekt.zweig}"`);
});

it.each(["leere Liste", "Prüffehler", "Listenfehler"])("behält beim Desktop-Start ohne Fehlermeldung den Startzustand: %s", async fall => {
  vi.mocked(isTauri).mockReturnValue(true);
  if (fall === "Listenfehler") vi.mocked(projekteZuletzt).mockRejectedValue(new Error("Nicht erreichbar"));
  else vi.mocked(projekteZuletzt).mockResolvedValue(fall === "leere Liste" ? [] : ["C:\\Fehlt"]);
  vi.mocked(projektPruefen).mockRejectedValue(new Error("Ordner gelöscht"));
  auswahl(); const aufraeumen = hooks.effekte[0](); await fertig(); await fertig(); aufraeumen();
  const { projekt, pfad, zweig } = vorher.kopf;
  expect(chatEingabeQuelle.lesen().kopf).toMatchObject({ projekt, pfad, zweig });
  expect(chatEingabeQuelle.lesen().kopf.geoeffnet).toBeUndefined();
  expect(projektPruefen).toHaveBeenCalledTimes(fall === "Prüffehler" ? 1 : 0);
  expect(renderToStaticMarkup(auswahl().inhalt)).not.toMatch(/ein-meldung|Ordner gelöscht|Nicht erreichbar/);
});

it("prüft im Browser beim Start kein Projekt und behält die Beispieldaten", async () => {
  vi.mocked(projekteZuletzt).mockResolvedValue(vorher.kopf.projekte);
  auswahl(); const aufraeumen = hooks.effekte[0](); await fertig(); aufraeumen();
  expect(projektPruefen).not.toHaveBeenCalled(); expect(chatEingabeQuelle.lesen().kopf).toEqual(vorher.kopf);
});

it.each(["geschlossen", "manuell geöffnet"])("verwirft eine späte Startprüfung: %s", async fall => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(projekteZuletzt).mockResolvedValue(["C:\\Alt"]);
  let antwort; vi.mocked(projektPruefen).mockReturnValue(new Promise(resolve => { antwort = resolve; }));
  auswahl(); const aufraeumen = hooks.effekte[0](); await fertig();
  expect(projektPruefen).toHaveBeenCalledExactlyOnceWith("C:\\Alt");
  expect(chatEingabeQuelle.lesen().kopf.geoeffnet).toBeUndefined();
  const projekt = { projekt: "Neu", pfad: "C:\\Neu", zweig: "neu" };
  if (fall === "geschlossen") aufraeumen();
  else {
    vi.mocked(projektOeffnen).mockResolvedValue(projekt); vi.mocked(projekteZuletzt).mockResolvedValue([projekt.pfad]);
    const { inhalt } = formular(projekt.pfad); inhalt.props.onSubmit({ preventDefault: vi.fn() }); await fertig();
  }
  antwort({ projekt: "Alt", pfad: "C:\\Alt", zweig: "alt" }); await fertig(); aufraeumen();
  expect(chatEingabeQuelle.lesen().kopf.pfad).toBe(fall === "geschlossen" ? vorher.kopf.pfad : projekt.pfad);
});

const kopfHtml = () => {
  hooks.aktiv = true; hooks.index = 0; hooks.effekte = [];
  try { return renderToStaticMarkup(<Kopf />); } finally { hooks.aktiv = false; }
};
it("zeigt geladene Anbieter mit eigenem Soll und null als unbekannt ohne Balken", async () => {
  vi.mocked(kontingentLesen).mockResolvedValueOnce({ claude: { genutzt: 17, soll: 57 }, codex: { genutzt: 86, soll: 63 } })
    .mockResolvedValueOnce({ claude: null, codex: { genutzt: 51, soll: 48 } });
  vi.useFakeTimers(); kopfHtml(); const stoppen = hooks.effekte[1](); await fertig();
  const html = kopfHtml();
  expect(html).toContain('aria-label="Claude: Genutzt 17 %, Soll 57 %"');
  expect(html).toContain('aria-label="Codex: Genutzt 86 %, Soll 63 %"');
  expect(html).toContain('class="kopf-soll" style="left:57%"');
  expect(html).toContain('class="kopf-soll" style="left:63%"');
  await vi.advanceTimersByTimeAsync(300000); const unbekannt = kopfHtml(); stoppen();
  expect(unbekannt).toContain('aria-label="Claude: unbekannt">Claude<b>unbekannt</b>');
  expect(unbekannt.match(/class="kopf-balken"/g)).toHaveLength(1);
  expect(unbekannt).toContain('aria-label="Codex: Genutzt 51 %, Soll 48 %"');
  expect(kontingentLesen).toHaveBeenCalledTimes(2);
});
it("behält bei Fehler den letzten Wert und stoppt beim Abbau Timer und späte Antworten", async () => {
  let antwort;
  vi.mocked(kontingentLesen).mockResolvedValueOnce({ claude: null, codex: { genutzt: 21, soll: 39 } })
    .mockRejectedValueOnce(new Error("Nicht erreichbar")).mockReturnValueOnce(new Promise(resolve => { antwort = resolve; }));
  vi.useFakeTimers(); kopfHtml(); const stoppen = hooks.effekte[1](); await fertig();
  const html = kopfHtml(); await vi.advanceTimersByTimeAsync(299999);
  expect(kontingentLesen).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(kopfHtml()).toBe(html);
  await vi.advanceTimersByTimeAsync(300000); stoppen();
  const stand = [...hooks.werte];
  antwort({ claude: null, codex: { genutzt: 99, soll: 99 } }); await fertig();
  expect(hooks.werte).toEqual(stand);
  await vi.advanceTimersByTimeAsync(300000); expect(kontingentLesen).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});

it("startet in Tauri ohne Beispielverbrauch und verwirft auch die erste späte Antwort", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  let antwort; vi.mocked(kontingentLesen).mockReturnValueOnce(new Promise(resolve => { antwort = resolve; }));
  vi.useFakeTimers(); const html = kopfHtml();
  for (const name of ["Claude", "Codex"]) expect(html).toContain(`aria-label="${name}: unbekannt"`);
  expect(html).not.toContain('class="kopf-balken"');
  const stoppen = hooks.effekte[1](); stoppen(); const stand = [...hooks.werte];
  antwort(vorher.kopf.kontingent); await fertig(); expect(hooks.werte).toEqual(stand);
  expect(vi.getTimerCount()).toBe(0);
});
