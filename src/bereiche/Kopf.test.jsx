import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Kopf, { ProjektWahl, bewegungSetzen, bewegungAktuell } from "./Kopf";
import { Children } from "react";
import { projektOeffnen, projekteZuletzt } from "../daten/tauri";
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
  it("liest geänderte Kontingente aus derselben Quelle wie der Chat", () => {
    const vorher = chatEingabeQuelle.lesen(), neu = structuredClone(vorher); neu.kopf.kontingent = { claude: 17, codex: 86, soll: 57 };
    try { chatEingabeQuelle.aktualisieren(neu); const html = renderToStaticMarkup(<Kopf />);
      expect(html).toContain("Genutzt 17 %, Soll 57 %"); expect(html).toContain("Genutzt 86 %, Soll 57 %");
      expect(html.match(/class="kopf-soll" style="left:57%"/g)).toHaveLength(2);
      expect(html).toContain("Weiße Marke: Soll 57 %"); expect(html).not.toContain("Soll 48 %");
    } finally { chatEingabeQuelle.aktualisieren(vorher); }
  });
});

const hooks = vi.hoisted(() => ({ aktiv: false, werte: [], index: 0, effekte: [] }));
vi.mock("../daten/tauri", () => ({ projektOeffnen: vi.fn(), projekteZuletzt: vi.fn() }));
vi.mock("react", async original => {
  const react = await original();
  return { ...react, useEffect: (...args) => { if (!hooks.aktiv) return react.useEffect(...args); hooks.effekte.push(args[0]); },
    useRef: (...args) => hooks.aktiv ? (hooks.werte[hooks.index++] ??= { current: args[0] }) : react.useRef(...args),
    useState: (...args) => {
      if (!hooks.aktiv) return react.useState(...args);
      const i = hooks.index++; if (!(i in hooks.werte)) hooks.werte[i] = args[0];
      return [hooks.werte[i], wert => { hooks.werte[i] = wert; }];
    } };
});
const vorher = chatEingabeQuelle.lesen();
afterEach(() => { hooks.aktiv = false; hooks.werte = []; hooks.effekte = []; vi.clearAllMocks(); chatEingabeQuelle.aktualisieren(vorher); });
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

it("öffnet per Formular und setzt Projektname, Pfad, Zweig und die letzte Liste im Kopf", async () => {
  const projekt = { projekt: "Unser Garten", pfad: "D:\\Arbeit\\Garten", zweig: "blumen" };
  vi.mocked(projektOeffnen).mockResolvedValue(projekt);
  // Das Formular muss nach Erfolg die gespeicherte Liste nachladen.
  vi.mocked(projekteZuletzt).mockResolvedValue([projekt.pfad, ...vorher.kopf.projekte]);
  const { inhalt, zu } = formular(` ${projekt.pfad} `);
  inhalt.props.onSubmit({ preventDefault: vi.fn() }); inhalt.props.onSubmit({ preventDefault: vi.fn() }); await fertig();
  expect(projektOeffnen).toHaveBeenCalledExactlyOnceWith(projekt.pfad); expect(zu).toHaveBeenCalledOnce();
  expect(projekteZuletzt).toHaveBeenCalledOnce();
  expect(chatEingabeQuelle.lesen().kopf).toMatchObject({ ...projekt, projekte: [projekt.pfad, ...vorher.kopf.projekte] });
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
