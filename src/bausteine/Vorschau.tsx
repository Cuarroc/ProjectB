import { useState } from "react";
import { ArrowUp, Plus, ChevronDown } from "lucide-react";
import { Statusmarke, zustaende, type Zustand } from "./Statusmarke";
import { Knopf } from "./Knopf";
import { Umschalter } from "./Umschalter";
import { Fortschrittsring } from "./Fortschrittsring";
import "./bausteine.css";
import VorschauMeldungen from "./VorschauMeldungen";

export default function Vorschau() {
  const [status, setStatus] = useState<Zustand>("arbeitet");
  const [ansicht, setAnsicht] = useState("Karten");
  const [kontext, setKontext] = useState("256k");
  const [fortschritt, setFortschritt] = useState(67);
  const [aktionen, setAktionen] = useState(0);
  const bedienung = ["Ruhe", "Hover", "Gedrückt", "Fokus", "Deaktiviert", "Laden"];
  const klassen = ["", "hover", "gedrueckt", "fokus", "", ""];
  const tafel = new URLSearchParams(window.location.search).get("tafel");
  if (tafel && ["toast", "tooltip", "leerzustand"].includes(tafel)) return <main className="vorschau"><VorschauMeldungen tafel={tafel} /></main>;
  return <main className="vorschau">
    <h1>Bausteine · Vorschau</h1>
    <section aria-label="Statusmarke"><div className="vorschau-zeile">{(Object.keys(zustaende) as Zustand[]).map(zustand => <Statusmarke key={zustand} zustand={zustand} />)}</div>
      <h2>Statuswechsel zum Ausprobieren</h2><div className="vorschau-zeile"><Statusmarke zustand={status} /><Knopf text="Nächster Zustand" variante="leise" onClick={() => { const liste = Object.keys(zustaende) as Zustand[]; setStatus(liste[(liste.indexOf(status) + 1) % liste.length]); }} /></div>
    </section>
    <section aria-label="Knöpfe"><h2>Varianten zum Ausprobieren: Maus und Tastatur</h2><div className="vorschau-zeile">
      <figure><Knopf text="Senden" variante="haupt" symbol={ArrowUp} onClick={() => setAktionen(aktionen + 1)} /><figcaption>Hauptknopf</figcaption></figure><figure><Knopf text="Neuer Chat" onClick={() => setAktionen(aktionen + 1)} /><figcaption>Zweitknopf</figcaption></figure>
      <figure><Knopf text="Effort Hoch" symbol={ChevronDown} vorsatz={<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M0 11h3v5H0z M4 8h3v8H4z M8 5h3v11H8z" /><path fill="var(--neutral-4)" d="M12 2h3v14h-3z" /></svg>} /><figcaption>Mit Menü</figcaption></figure><figure><Knopf text="Datei anhängen" nurSymbol symbol={Plus} onClick={() => setAktionen(aktionen + 1)} /><figcaption>Symbolknopf</figcaption></figure>
      <figure><Knopf text="Protokoll öffnen" variante="leise" /><figcaption>Leise</figcaption></figure><figure><Knopf text="Streichen" variante="gefaehrlich" /><figcaption>Gefährlich</figcaption></figure><figure><Knopf text="In Downloads" variante="antwort" /><figcaption>Antwort</figcaption></figure>
    </div><p aria-live="polite">Ausgelöste Handlungen: {aktionen}</p><h2>Zustände nebeneinander</h2>
      <table><thead><tr><th scope="col">Variante</th>{bedienung.map(s => <th scope="col" key={s}>{s}</th>)}</tr></thead><tbody>
        {(["haupt", "zweit", "leise", "gefaehrlich", "antwort", "symbol"] as const).map((v, reihe) => <tr key={v}><th scope="row">{["Hauptknopf", "Zweitknopf", "Leise", "Gefährlich", "Antwort", "Symbolknopf"][reihe]}</th>
          {bedienung.map((s, i) => <td key={s}><Knopf text={["Senden", "Speichern", "Öffnen", "Streichen", "Antworten", "Datei anhängen"][reihe]} variante={v === "symbol" ? "zweit" : v} symbol={v === "symbol" ? Plus : v === "haupt" ? ArrowUp : undefined} nurSymbol={v === "symbol"} className={klassen[i]} disabled={i === 4} grund={i === 4 ? "Schreib zuerst etwas." : undefined} laedt={i === 5} ladeText={["Sendet …", "Speichert …", "Öffnet …", "Streicht …", "Antwortet …", "Hängt an …"][reihe]} /></td>)}
        </tr>)}
      </tbody></table><p>Deaktiviert: Schreib zuerst etwas. Laden: Die Breite bleibt, ohne Drehsymbol.</p>
    </section>
    <section aria-label="Umschalter"><h2>Zum Ausprobieren: Klick oder Pfeiltasten</h2><div className="vorschau-zeile">
      <Umschalter moeglichkeiten={["Karten", "Board", "Zeitstrahl", "Vorschau"]} wert={ansicht} onChange={setAnsicht} beschriftung="Teamansicht" />
      <div className="vorschau-kontext"><span>Kontext</span><Umschalter moeglichkeiten={["256k", "1M"]} wert={kontext} onChange={setKontext} beschriftung="Kontextfenster" /></div>
    </div><h2>Zustände eines Teils</h2><div className="vorschau-zeile">{["Ruhe", "Hover", "Gewählt", "Fokus"].map((s, i) => <figure key={s}><div className="umschalter"><button type="button" className={i === 1 ? "hover" : i === 3 ? "fokus" : ""} style={i === 2 ? { background: "var(--akzent-grund)", color: "var(--akzent-text)" } : undefined}>{i === 2 ? "Karten" : "Board"}</button></div><figcaption>{s}</figcaption></figure>)}</div>
      <p>Nur für Ansichten und Größen. Die Modi des Chats sind getrennte Knöpfe, siehe Eingabefeld.</p>
    </section>
    <section aria-label="Fortschrittsring"><h2>Fortschrittsring</h2><div className="vorschau-zeile">
      {([0, 67, 100] as const).map(wert => <figure key={wert}><Fortschrittsring wert={wert} zustand={wert === 0 ? "offen" : "arbeitet"} /><figcaption>{wert === 0 ? "Offen · 0 %" : wert === 100 ? "Fertig" : "Arbeitet · 67 %"}</figcaption></figure>)}
      <figure><Fortschrittsring wert={40} zustand="ziel" groesse={52} text="2 / 5" /><figcaption>Ziel</figcaption></figure>
      <figure><span><Fortschrittsring wert={38} zustand="kontext" groesse={20} /> 38 %</span><figcaption>Kontext</figcaption></figure>
      <figure><Fortschrittsring wert={50} zustand="wartet" groesse={40} /><figcaption>Wartet auf dich</figcaption></figure><figure><Fortschrittsring wert={25} zustand="problem" /><figcaption>Problem</figcaption></figure>
    </div><h2>Zum Ausprobieren</h2><div className="vorschau-zeile"><Fortschrittsring wert={fortschritt} /><Knopf text="Weiter" variante="leise" onClick={() => setFortschritt(fortschritt === 100 ? 0 : Math.min(100, fortschritt + 10))} /></div>
    </section>
    <VorschauMeldungen />
  </main>;
}
