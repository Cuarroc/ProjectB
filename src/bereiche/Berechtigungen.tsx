import { useRef, useState } from "react";
import { Check, ChevronDown, Circle, CircleX, FileText, Lock, Mail, Shield, X } from "lucide-react";
import { Knopf } from "../bausteine/Knopf";
import type { BeispielQuelle } from "../daten/quelle";
import type { Berechtigungen as Rechte, Berechtigungsstufe } from "../daten/typen";
import "./Berechtigungen.css";

const symbol = { size: 16, strokeWidth: 1.5, absoluteStrokeWidth: true, "aria-hidden": true } as const;
const hinweise = ["Gut zum Kennenlernen und für heikle Aufgaben.", "Fragt nur, wenn etwas außerhalb des Projekts wirkt.", "Was dein Ja braucht, legt er dir hin und macht mit anderem weiter."];
const saetze = ["Fragt vor jeder Änderung.", "Arbeitet allein in seiner Arbeitskopie.", "Fragt nie und arbeitet durch."];
const technik = ["Claude: default · Codex: untrusted, read-only", "Claude: acceptEdits · Codex: on-request, workspace-write", "Claude: bypassPermissions in der Arbeitskopie · Codex: never, workspace-write"];
const arten = ["Allein", "Fragt dich", "Legt es dir hin", "Nie"] as const;
const symbole = { Allein: Check, "Fragt dich": Circle, "Legt es dir hin": Mail, Nie: Lock };
export function stufeUebernehmen(quelle: BeispielQuelle, stufe: Berechtigungsstufe, probe: boolean) {
  if (probe) return "Nicht übernommen. Die alte Stufe gilt weiter.";
  const daten = quelle.lesen(); daten.berechtigungen.aktuell = stufe; quelle.aktualisieren(daten); return "";
}
function Balken({ stufe }: { stufe: number }) {
  return <span className="kopf-stufen" aria-hidden="true">{[0, 1, 2, 3].map(i => <i key={i} data-an={i <= stufe} style={{ height: `${(i + 1) * 25}%` }} />)}</span>;
}
export default function Berechtigungen({ daten, quelle }: { daten: Rechte; quelle: BeispielQuelle }) {
  const dialog = useRef<HTMLDialogElement>(null), knopf = useRef<HTMLButtonElement>(null);
  const [wahl, waehle] = useState(daten.aktuell), [fehler, setFehler] = useState(""), [probe, setProbe] = useState(false);
  const index = daten.stufen.findIndex(s => s.name === wahl), geaendert = wahl !== daten.aktuell;
  const anzahl = (art: typeof arten[number]) => daten.regeln.filter(r => r.stufen[wahl] === art).length;
  const zu = () => { if (dialog.current) { dialog.current.inert = true; dialog.current.close(); } };
  const auswahl = (i: number) => { waehle(daten.stufen[i].name); setFehler(""); };
  return <>
    <button type="button" className="kopf-knopf" aria-label={`Berechtigungen: ${daten.aktuell}`} aria-haspopup="dialog" ref={knopf}
      onClick={() => { waehle(daten.aktuell); setFehler(""); setProbe(false); if (dialog.current) { dialog.current.inert = false; dialog.current.showModal(); dialog.current.querySelector<HTMLButtonElement>(".ber-abbrechen")?.focus(); } }}>
      <Shield {...symbol} /><span>{daten.aktuell}</span><Balken stufe={daten.stufen.findIndex(s => s.name === daten.aktuell)} /><ChevronDown {...symbol} />
    </button>
    <dialog className="ber-dialog" aria-labelledby="ber-titel" aria-describedby="ber-text" ref={dialog} onCancel={e => { e.preventDefault(); zu(); }} onClose={() => knopf.current?.focus()} onKeyDown={e => {
      if (e.key !== "Tab") return;
      const ziele = [...e.currentTarget.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')].filter(z => z.tabIndex >= 0 && !z.matches(":disabled") && z.getClientRects().length);
      const i = ziele.indexOf(document.activeElement as HTMLElement);
      if ((e.shiftKey && i <= 0) || (!e.shiftKey && i === ziele.length - 1)) { e.preventDefault(); ziele[e.shiftKey ? ziele.length - 1 : 0]?.focus(); }
    }}>
      <div className="ber-kopf"><span className="ber-kopf-symbol"><Shield {...symbol} /></span><div><h2 id="ber-titel">Berechtigungen des Orchestrators</h2><p id="ber-text">Gilt für ProjectB und für alle Agenten, die der Orchestrator startet.</p></div><Knopf text="Schließen" symbol={X} nurSymbol variante="leise" onClick={zu} /></div>
      <div className="ber-inhalt" tabIndex={0} role="group" aria-label="Stufen und Rechte">
        <div className="ber-stufen" role="radiogroup" aria-label="Stufe" onKeyDown={e => {
          const ziel = ({ ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: 2 } as Record<string, number>)[e.key];
          if (ziel === undefined) return; e.preventDefault(); const i = (ziel + 3) % 3; auswahl(i); e.currentTarget.querySelectorAll<HTMLButtonElement>("button")[i].focus();
        }}>{daten.stufen.map((s, i) => <button type="button" role="radio" className="ber-stufe" key={s.name} aria-checked={wahl === s.name} tabIndex={wahl === s.name ? 0 : -1} onClick={() => auswahl(i)}>
          <span className="ber-stufe-kopf"><span className="ber-stufe-zahl"><span className="ber-meter" aria-hidden="true">{[0, 1, 2, 3].map(n => <i key={n} data-aktiv={n <= i} style={{ height: `${(n + 1) * 25}%` }} />)}</span>Stufe {i + 1}</span>
            {i === 1 && <span className="ber-empf">Empfohlen</span>}{s.name === daten.aktuell && <span className="ber-gilt">Gilt jetzt</span>}</span>
          <strong>{s.name}</strong><span>{saetze[i]}</span><span className="ber-z2">{hinweise[i]}</span>
        </button>)}</div>
        <div className="ber-raster"><section className="ber-karte"><h3>Was er in der Stufe „{wahl}“ darf</h3>
          <div className="ber-vert" aria-label="Verteilung der 10 Handlungen">{arten.map(art => anzahl(art) > 0 && <span key={art} data-art={art} style={{ flex: anzahl(art) }} aria-label={`${anzahl(art)} ${art}`}>{anzahl(art)}</span>)}</div>
          <div className="ber-achse" aria-hidden="true"><span>0</span><span>5</span><span>10 Handlungen</span></div>
          <div className="ber-legende">{arten.map(art => <span key={art} data-art={art}><i aria-hidden="true" />{art} <b>{anzahl(art)}</b></span>)}</div>
          <ul className="ber-liste">{daten.regeln.map(r => { const art = r.stufen[wahl], Symbol = symbole[art]; return <li key={r.text}>
            <span>{r.text}</span><span className="ber-pille" data-art={art}><Symbol {...symbol} fill={art === "Fragt dich" ? "currentColor" : "none"} />{art}</span>
          </li>; })}</ul>
        </section><div className="ber-spalte"><section className="ber-karte"><h3>Gilt immer, in jeder Stufe</h3><ul className="ber-immer">{daten.giltImmer.map(text => <li key={text}><Lock {...symbol} /><span>{text}</span></li>)}</ul>
          <p className="ber-feld">Diese Grenzen stehen in den Regeln des Projekts und lassen sich hier nicht lockern.</p><p><FileText {...symbol} /> Jede Freigabe steht mit Uhrzeit im Protokoll.</p>
        </section><section className="ber-karte"><h3>Technisch</h3><code className="ber-feld">{technik[index]}</code></section></div></div>
      </div>
      <div className="ber-fuss"><label className="ber-probe"><input type="checkbox" checked={probe} onChange={e => setProbe(e.target.checked)} />Nächstes Übernehmen schlägt fehl</label>
        <p id="ber-meldung" className="ber-meldung" aria-live="polite">{fehler ? <><CircleX {...symbol} />{fehler}</> : !geaendert ? "Wähl zuerst eine andere Stufe." : ""}</p>
        <Knopf text="Abbrechen" variante="leise" className="ber-abbrechen" onClick={zu} /><Knopf text="Übernehmen" variante="haupt" disabled={!geaendert} aria-describedby="ber-meldung" onClick={() => {
          const meldung = stufeUebernehmen(quelle, wahl, probe); setFehler(meldung); setProbe(false); if (!meldung) zu();
        }} />
      </div>
    </dialog>
  </>;
}
