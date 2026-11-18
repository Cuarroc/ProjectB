import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Circle, CircleX, FileText, Lock, Mail, OctagonPause, Shield, X } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { einstellungenLaden, einstellungenAendern } from "../daten/tauri";
import { Knopf } from "../bausteine/Knopf";
import type { BeispielQuelle } from "../daten/quelle";
import type { Berechtigungen as Rechte, Berechtigungsstufe } from "../daten/typen";
import "./Berechtigungen.css";

const symbol = { size: 16, strokeWidth: 1.5, absoluteStrokeWidth: true, "aria-hidden": true } as const;
const hinweise = ["Claude: Bash nur zum Lesen und für Tests.", "Claude: Bash auch für Build, add und commit.", "Claude: Bash frei. Die Sperrliste bleibt."];
const saetze = ["Codex: nur lesen, ändert nichts.", "Codex: alles in der Arbeitskopie, ohne Netz.", "Codex: alles in der Arbeitskopie, mit Netz."];
const technik = ["Claude-Bash: Lesen und Tests", "Claude-Bash: Lesen, Tests, Build, add und commit", "Claude-Bash: frei"].map((bash, i) =>
  `Claude: acceptEdits, Sperrliste bleibt · ${bash} · Codex: ${i === 0 ? "read-only" : "workspace-write"}, approval never · Netz für Codex: ${i === 2 ? "an" : "aus"}`);
const arten = ["Allein", "Fragt dich", "Legt es dir hin", "Nie"] as const;
const symbole = { Allein: Check, "Fragt dich": Circle, "Legt es dir hin": Mail, Nie: Lock };
export function stufeUebernehmen(quelle: BeispielQuelle, stufe: Berechtigungsstufe, probe: boolean) {
  if (probe) return "Nicht übernommen. Die alte Stufe gilt weiter.";
  const daten = quelle.lesen(); daten.berechtigungen.aktuell = stufe; quelle.aktualisieren(daten); return "";
}
export async function stufeLaden(quelle: BeispielQuelle, projekt: string, aktiv = () => true) {
  const { berechtigung } = await einstellungenLaden(projekt);
  if (aktiv() && quelle.lesen().kopf.pfad === projekt) stufeUebernehmen(quelle, berechtigung, false);
}
export async function stufeSpeichern(quelle: BeispielQuelle, projekt: string, stufe: Berechtigungsstufe) {
  const { berechtigung } = await einstellungenAendern(projekt, { berechtigung: stufe });
  if (quelle.lesen().kopf.pfad === projekt) stufeUebernehmen(quelle, berechtigung, false);
}
function Balken({ stufe }: { stufe: number }) {
  return <span className="kopf-stufen" aria-hidden="true">{[0, 1, 2, 3].map(i => <i key={i} data-an={i <= stufe} style={{ height: `${(i + 1) * 25}%` }} />)}</span>;
}
export default function Berechtigungen({ daten, quelle }: { daten: Rechte; quelle: BeispielQuelle }) {
  const dialog = useRef<HTMLDialogElement>(null), knopf = useRef<HTMLButtonElement>(null);
  const [wahl, waehle] = useState(daten.aktuell), [fehler, setFehler] = useState(""), [probe, setProbe] = useState(false);
  const pfad = quelle.lesen().kopf.pfad;
  const [beschaeftigt, setBeschaeftigt] = useState(false), [geladen, setGeladen] = useState(!isTauri());
  useEffect(() => {
    if (!isTauri()) return;
    let aktiv = true; setGeladen(false); setFehler("");
    if (dialog.current?.open) dialog.current.close();
    stufeLaden(quelle, pfad, () => aktiv).catch(e => { if (aktiv) setFehler(`Nicht geladen: ${String(e)}`); })
      .finally(() => { if (aktiv) setGeladen(true); });
    return () => { aktiv = false; };
  }, [quelle, pfad]);
  const index = daten.stufen.findIndex(s => s.name === wahl), geaendert = wahl !== daten.aktuell;
  const anzahl = (art: typeof arten[number]) => daten.regeln.filter(r => r.stufen[wahl] === art).length;
  const zu = () => { if (dialog.current) { dialog.current.inert = true; dialog.current.close(); } };
  const auswahl = (i: number) => { waehle(daten.stufen[i].name); setFehler(""); };
  return <>
    <button type="button" className="kopf-knopf" disabled={!geladen} aria-label={`Berechtigungen: ${daten.aktuell}`} aria-haspopup="dialog" ref={knopf}
      onClick={() => { waehle(daten.aktuell); if (!isTauri()) setFehler(""); setProbe(false); if (dialog.current) { dialog.current.inert = false; dialog.current.showModal(); dialog.current.querySelector<HTMLButtonElement>(".ber-abbrechen")?.focus(); } }}>
      <Shield {...symbol} /><span>{daten.aktuell}</span><Balken stufe={daten.stufen.findIndex(s => s.name === daten.aktuell)} /><ChevronDown {...symbol} />
    </button>
    <dialog className="ber-dialog" aria-labelledby="ber-titel" aria-describedby="ber-text" ref={dialog} onCancel={e => { e.preventDefault(); zu(); }} onClose={() => knopf.current?.focus()} onKeyDown={e => {
      if (e.key !== "Tab") return;
      const ziele = [...e.currentTarget.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')].filter(z => z.tabIndex >= 0 && !z.matches(":disabled") && z.getClientRects().length);
      const i = ziele.indexOf(document.activeElement as HTMLElement);
      if ((e.shiftKey && i <= 0) || (!e.shiftKey && i === ziele.length - 1)) { e.preventDefault(); ziele[e.shiftKey ? ziele.length - 1 : 0]?.focus(); }
    }}>
      <div className="ber-kopf"><span className="ber-kopf-symbol"><Shield {...symbol} /></span><div><h2 id="ber-titel">Berechtigungen des Orchestrators</h2><p id="ber-text">Gilt ab dem nächsten Team-Start in diesem Projekt. Ein laufendes Team behält seine Stufe.</p></div><Knopf text="Schließen" symbol={X} nurSymbol variante="leise" onClick={zu} /></div>
      <div className="ber-inhalt" tabIndex={0} role="group" aria-label="Stufen und Rechte">
        <div className="ber-stufen" role="radiogroup" aria-label="Stufe" onKeyDown={e => {
          const ziel = ({ ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: 2 } as Record<string, number>)[e.key];
          if (ziel === undefined) return; e.preventDefault(); const i = (ziel + 3) % 3; auswahl(i); e.currentTarget.querySelectorAll<HTMLButtonElement>("button")[i].focus();
        }}>{daten.stufen.map((s, i) => <button type="button" role="radio" className="ber-stufe" key={s.name} aria-checked={wahl === s.name} tabIndex={wahl === s.name ? 0 : -1} onClick={() => auswahl(i)}>
          <span className="ber-stufe-kopf"><span className="ber-stufe-zahl"><span className="ber-meter" aria-hidden="true">{[0, 1, 2, 3].map(n => <i key={n} data-aktiv={n <= i} style={{ height: `${(n + 1) * 25}%` }} />)}</span>Stufe {i + 1}</span>
            {i === 1 && <span className="ber-empf">Empfohlen</span>}{s.name === daten.aktuell && <span className="ber-gilt">Gilt jetzt</span>}</span>
          <strong>{s.name}</strong><span>{saetze[i]}</span><span className="ber-z2">{hinweise[i]}</span>
        </button>)}</div>
        <div className="ber-raster"><section className="ber-karte"><div className="ber-kartenkopf"><h3>Was er in der Stufe „{wahl}“ darf</h3><span className="ber-chip">{daten.regeln.length} Handlungen</span></div>
          <div className="ber-vert" aria-label={`Verteilung der ${daten.regeln.length} Handlungen`}>{arten.map(art => anzahl(art) > 0 && <span key={art} data-art={art} style={{ flex: anzahl(art) }} aria-label={`${anzahl(art)} ${art}`}>{anzahl(art)}</span>)}</div>
          <div className="ber-achse" aria-hidden="true"><span>0</span><span>{Math.floor(daten.regeln.length / 2)}</span><span>{daten.regeln.length} Handlungen</span></div>
          <div className="ber-legende">{arten.map(art => <span key={art} data-art={art}><i aria-hidden="true" />{art} <b>{anzahl(art)}</b></span>)}</div>
          <ul className="ber-liste">{daten.regeln.map(r => { const art = r.stufen[wahl], Symbol = symbole[art]; return <li key={r.text}>
            <span>{r.text}</span><span className="ber-pille" data-art={art}><Symbol {...symbol} fill={art === "Fragt dich" ? "currentColor" : "none"} />{art}</span>
          </li>; })}</ul>
        </section><div className="ber-spalte"><section className="ber-karte"><h3>Gilt immer, in jeder Stufe</h3><ul className="ber-immer">{daten.giltImmer.map(text => <li key={text}><Lock {...symbol} /><span>{text}</span></li>)}</ul>
          <p className="ber-feld">Diese Grenzen stehen in den Regeln des Projekts und lassen sich hier nicht lockern.</p><ul className="ber-immer ber-auch"><li><FileText {...symbol} /><span>Jede Freigabe steht mit Uhrzeit im Protokoll.</span></li><li><OctagonPause {...symbol} /><span>„Alles anhalten“ wirkt sofort.</span></li></ul>
        </section><section className="ber-karte"><div className="ber-kartenkopf"><h3>Technisch</h3><span className="ber-chip">{wahl}</span></div><div className="ber-feld ber-technik">{technik[index].split(" · ").map(zeile => <code key={zeile}>{zeile}</code>)}</div></section></div></div>
      </div>
      <div className="ber-fuss">{new URLSearchParams(globalThis.location?.search).has("beispielFehler") && <label className="ber-probe"><input type="checkbox" checked={probe} onChange={e => setProbe(e.target.checked)} />Nächstes Übernehmen schlägt fehl</label>}
        <p id="ber-meldung" className={`ber-meldung${!fehler && !geaendert ? " ber-feld" : ""}`} aria-live="polite">{fehler ? <><CircleX {...symbol} />{fehler}</> : !geaendert ? "Wähl zuerst eine andere Stufe." : ""}</p>
        <Knopf text="Abbrechen" variante="zweit" className="ber-abbrechen" onClick={zu} /><Knopf text="Übernehmen" variante="haupt" disabled={!geaendert || beschaeftigt || !geladen} aria-describedby="ber-meldung" onClick={async () => {
          if (isTauri()) {
            setBeschaeftigt(true);
            try { await stufeSpeichern(quelle, pfad, wahl); setFehler(""); zu(); }
            catch (e) { setFehler(`Nicht gespeichert: ${String(e)}`); }
            finally { setBeschaeftigt(false); }
            return;
          }
          const meldung = stufeUebernehmen(quelle, wahl, probe); setFehler(meldung); setProbe(false); if (!meldung) zu();
        }} />
      </div>
    </dialog>
  </>;
}
