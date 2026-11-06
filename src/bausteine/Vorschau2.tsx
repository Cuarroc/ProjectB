import { useState } from "react";
import { Agentenkarte, type AgentenkarteProps } from "./Agentenkarte";
import { Kachel } from "./Kachel";
import { Zeitspur, type ZeitspurProps, type Phase } from "./Zeitspur";

const phasen: Phase[] = [{ art: "lesen", name: "Lesen", start: 70, ende: 100 }, { art: "bauen", name: "Bauen", start: 100, ende: 250 }, { art: "testen", name: "Testen", start: 250, ende: 432, laufend: true }];
const arbeitet: ZeitspurProps = { phasen, jetzt: 432, schaetzung: 560, ereignisse: [{ zeit: 300, art: "problem", text: "3 Tests rot" }] };
const wartet: ZeitspurProps = { phasen: phasen.slice(0, 2), jetzt: 432, zustand: "wartet", wartebeginn: 250, wartezeit: "1:12", ereignisse: [{ zeit: 250, art: "frage", text: "Wohin soll export.csv?" }] };
const fertig: ZeitspurProps = { phasen: [{ ...phasen[0] }, { ...phasen[1], ende: 216 }, { ...phasen[2], start: 216, ende: 312, laufend: false }, { art: "review", name: "Review", start: 312, ende: 372 }], zustand: "fertig", jetzt: 432, ereignisse: [{ zeit: 372, art: "fertig", text: "Fertig" }] };
const problem: ZeitspurProps = { phasen: [{ ...phasen[0] }, { ...phasen[1], ende: 300 }], jetzt: 432, zustand: "problem", ereignisse: [{ zeit: 300, art: "problem", text: "Build fehlgeschlagen" }] };
const spurproben: [string, ZeitspurProps][] = [["Arbeitet", arbeitet], ["Wartet auf dich", wartet], ["Fertig", fertig], ["Orchestrator", { phasen: [{ ...phasen[0], start: 6, ende: 35 }, { ...phasen[0], start: 36, ende: 65 }, { art: "koordiniert", name: "Koordiniert", start: 66, ende: 432, laufend: true }], jetzt: 432 }], ["Startet", { phasen: [], zustand: "startet", jetzt: 432 }], ["Länger als geschätzt", { ...arbeitet, jetzt: 372, schaetzung: 360, phasen: phasen.map(p => p.laufend ? { ...p, ende: 372 } : p), ereignisse: [] }], ["Problem", problem]];
const karten: [string, AgentenkarteProps][] = [
  ["Arbeitet, gewählt", { name: "CSV-Export im Kern", modell: "Codex · gpt-6.1-sol", zustand: "arbeitet", fortschritt: 67, zeitspur: arbeitet, zeile: "cargo test export · 14 von 21 grün", tokens: "132k", laufzeit: "6:12", gewaehlt: true }],
  ["Startet", { name: "Parser für Kopfzeilen", modell: "Claude · Opus 5.5", zustand: "arbeitet", zeitspur: spurproben[4][1], zeile: "Noch keine Ausgabe", tokens: "0", laufzeit: "0:04" }],
  ["Angehalten, mit Fortsetzen", { name: "Spalten umbenennen", modell: "Codex · gpt-6.1-sol", zustand: "wartet", fortschritt: 40, zeitspur: wartet, zeile: "Angehalten. Weiter mit Fortsetzen.", tokens: "48k", laufzeit: "2:05", aktion: "Fortsetzen" }],
  ["Fertig", { name: "Tests für den Export", modell: "Claude · Opus 5.5", zustand: "fertig", fortschritt: 100, zeitspur: fertig, zeile: "PR #57 erstellt · 33 von 33 grün", tokens: "210k", laufzeit: "18:40" }],
  ["Problem", { name: "Build für Windows", modell: "Kimi · k3", zustand: "problem", fortschritt: 55, zeitspur: problem, zeile: "cargo build bricht in kern ab", tokens: "0", laufzeit: "0:00", aktion: "Protokoll öffnen" }],
  ["Langer Name: einzeilig mit „…“, voller Name im Tooltip", { name: "CSV-Export im Kern mit Prüfsummen, Zeichensatz-Umwandlung nach UTF-8, Windows-Zeilenenden und einer Vorschau der ersten zwanzig Zeilen im Chat", modell: "Codex · gpt-6.1-sol", zustand: "arbeitet", fortschritt: 12, zeitspur: arbeitet, zeile: "cargo check · 0 Fehler", tokens: "48k", laufzeit: "2:05" }],
];
const linie = <svg className="b2-linie" width="140" height="18" viewBox="0 0 140 18" role="img" aria-label="Grüne Tests über die Zeit"><polyline points="1,16 23.3,13.3 45.7,9.9 68,7.9 90.3,9.9 112.7,3.8 139,1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /></svg>;
export default function Vorschau2() {
  const tafel = new URLSearchParams(location.search).get("tafel"), [auswahl, setAuswahl] = useState(0), [fortgesetzt, setFortgesetzt] = useState(false), [meldung, setMeldung] = useState("");
  const aufgaben = <Kachel titel="Aufgaben" thema="aufgaben" zahl="2 / 5" balken={40} unterzeile="3 offen" />;
  return <main className="b2-vorschau"><div className="b2-buehne">
    {(!tafel || tafel === "kachel") && <>
      <section><h2 className="b2-titel">Mit Wert</h2><div className="b2-reihe">{aufgaben}<Kachel titel="Tests grün" zahl="26 / 33" grafik={linie} unterzeile="Um 14:35 kurz 3 rot" /><Kachel titel="Tokens" thema="tokens" zahl="1,2M" grafik={<span className="b2-stapel" aria-hidden="true"><span /><span /></span>} unterzeile="Orchestrator 425k · Agenten 775k" /></div></section>
      <section><h2 className="b2-titel">Lange Unterzeile: bricht um, die Nachbarn wachsen mit</h2><div className="b2-reihe"><Kachel titel="Tests grün" zahl="33 / 33" grafik={linie} unterzeile="Um 14:35 kurz 3 rot, seit 14:41 wieder alle grün, zuletzt geprüft um 14:52" />{aufgaben}</div></section>
      <section><h2 className="b2-titel">Lädt, leer, Fehler</h2><div className="b2-reihe"><Kachel titel="Tests grün" zustand="laedt" unterzeile="" /><Kachel titel="Tests grün" zustand="leer" unterzeile="Noch keine Tests gelaufen" /><Kachel titel="Tests grün" zustand="fehler" unterzeile="" onWiederholen={() => setMeldung("Tests werden erneut geladen.")} /></div></section>
    </>}
    {(!tafel || tafel === "agentenkarte") && <div className="ak-raster">{karten.map(([titel, p], i) => <section className="ak-probe" key={titel}><h2 className="b2-titel">{titel}</h2><Agentenkarte {...p} gewaehlt={auswahl === i} onDetails={() => { setAuswahl(i); setMeldung(`${p.name}: Details gewählt.`); }} {...(i === 2 && fortgesetzt ? { zustand: "arbeitet", zeitspur: arbeitet, zeile: "Arbeitet wieder.", aktion: "Anhalten" } : {})} onAktion={() => i === 2 ? setFortgesetzt(!fortgesetzt) : setMeldung("Protokoll gewählt.")} /></section>)}</div>}
    {(!tafel || tafel === "zeitspur") && <div className="zs-liste">{spurproben.map(([titel, p]) => <section style={{ display: "contents" }} key={titel}><span className="zs-name">{titel}</span><Zeitspur {...p} /></section>)}</div>}
    <span className="b2-sr" aria-live="polite">{meldung}</span>
  </div></main>;
}
