import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AlignLeft, Check, Circle, CircleMinus, Lightbulb, ListChecks, ListTree, MessageSquare, RefreshCw, Users, X, Zap } from "lucide-react";
import { Knopf } from "../bausteine/Knopf";
import { Statusmarke } from "../bausteine/Statusmarke";
import type { Datenstand, Markierung, Plan } from "../daten/typen";
import "./Planfenster.css";

export const farben = [
  ["Kommentar", "kommentar", "Silbergrau", MessageSquare], ["Ausarbeiten", "ausarbeiten", "Violett", ListTree],
  ["Simpler", "simpler", "Türkis", CircleMinus], ["Ausführlicher", "ausfuehrlicher", "Gelb", AlignLeft],
  ["Innovativer", "innovativer", "Pink", Lightbulb],
] as const;
type Marke = { name: Markierung; start: number; ende: number };
export type PlanMarken = Record<string, Marke>;
const farbe = (name: Markierung) => `var(--markierung-${farben.find(f => f[0] === name)![1]})`;
export function MarkierterText({ text, marke }: { text: string; marke?: Marke }) {
  return marke ? <>{text.slice(0, marke.start)}<mark style={{ "--f": farbe(marke.name) } as CSSProperties}
    aria-label={`${marke.name}, ${farben.find(f => f[0] === marke.name)![2]}`}>{text.slice(marke.start, marke.ende)}</mark>{text.slice(marke.ende)}</> : <>{text}</>;
}
export default function Planfenster({ daten, gespeicherteMarken, onSchliessen, onEntscheiden }: {
  daten: Datenstand; gespeicherteMarken: PlanMarken; onSchliessen: () => void; onEntscheiden: (plan: Plan, marken: PlanMarken) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [plan, setPlan] = useState(() => structuredClone(daten.plan));
  const [marken, setMarken] = useState<PlanMarken>(gespeicherteMarken);
  const auswahl = useRef<{ id: string; feld: string; start: number; ende: number } | null>(null);
  const [hinweis, setHinweis] = useState("");
  const [stil, setStil] = useState("Ausführlicher");
  useEffect(() => { const fenster = dialog.current!, vorher = document.activeElement as HTMLElement;
    fenster.showModal(); return () => { fenster.close(); vorher?.focus(); }; }, []);
  const schrittAendern = (id: string, a: Partial<Plan["schritte"][number]>) => setPlan(p => ({ ...p, schritte: p.schritte.map(s => s.id === id ? { ...s, ...a } : s) }));
  const markieren = (id: string, name: Markierung) => {
    const s = plan.schritte.find(s => s.id === id)!;
    schrittAendern(id, { markierungen: s.markierungen.includes(name) ? s.markierungen.filter(m => m !== name) : [...s.markierungen, name] });
    const a = auswahl.current?.id === id ? auswahl.current : { feld: "titel", start: 0, ende: s.titel.length };
    setMarken(m => s.markierungen.includes(name) ? Object.fromEntries(Object.entries(m).filter(([k, v]) => !k.startsWith(`${id}:`) || v.name !== name))
      : { ...m, [`${id}:${a.feld}`]: { name, start: a.start, ende: a.ende } });
  };
  const erfassen = (id: string, element: HTMLElement, feld = "titel") => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const r = selection.getRangeAt(0);
    if (!element.contains(r.commonAncestorContainer)) return;
    const davor = r.cloneRange(); davor.selectNodeContents(element); davor.setEnd(r.startContainer, r.startOffset);
    auswahl.current = { id, feld, start: davor.toString().length, ende: davor.toString().length + r.toString().length };
  };
  const entscheiden = (freigeben: boolean) => {
    if (!freigeben && !plan.schritte.some(s => s.kommentar.trim())) { setHinweis("Schreib einen Kommentar, bevor du den Plan zurückgibst."); return; }
    onEntscheiden({ ...plan, freigabe: freigeben ? "Freigegeben" : "Wartet auf dich" }, marken); onSchliessen();
  };
  return <dialog ref={dialog} className="planfenster" aria-labelledby="plan-titel" onCancel={e => { e.preventDefault(); onSchliessen(); }} onKeyDown={e => {
    if (e.key !== "Tab") return;
    const ziele = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),textarea,[tabindex='0']")], erstes = ziele[0], letztes = ziele.at(-1);
    if (e.shiftKey && document.activeElement === erstes) { e.preventDefault(); letztes?.focus(); }
    else if (!e.shiftKey && document.activeElement === letztes) { e.preventDefault(); erstes?.focus(); }
  }}>
    <section className="pl-links">
      <header className="pl-kopf"><span className="pl-kopf-symbol"><ListChecks size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /></span>
        <div className="pl-kopftext"><h2 id="plan-titel">Plan: {plan.titel}</h2><div className="pl-meta">Orchestrator · 14:31 <span>{plan.schritte.length} Schritte</span></div></div>
        <Statusmarke zustand={plan.freigabe === "Freigegeben" ? "fertig" : "wartet"} /><Knopf text="Plan schließen" symbol={X} nurSymbol variante="leise" onClick={onSchliessen} />
      </header>
      <ol className="pl-liste" tabIndex={0} aria-label="Planschritte">{plan.schritte.map((s, i) => {
        const agent = daten.agenten.find(a => a.id === s.agentId);
        return <li className="pl-schritt" key={s.id}>
          <div className="pl-streifen" aria-hidden="true">{s.markierungen.map(m => <span key={m} style={{ background: farbe(m) }} />)}</div>
          <div className="pl-kopfzeile"><span className="pl-nr">{i + 1}</span><div className="pl-kopftext">
            <div className="pl-titelzeile"><h3 onMouseUp={e => erfassen(s.id, e.currentTarget)}><MarkierterText text={s.titel} marke={marken[`${s.id}:titel`]} /></h3>
              {s.markierungen.map(m => <span className="pl-marke" key={m} style={{ "--f": farbe(m) } as CSSProperties}>{m}</span>)}</div>
            <p className="pl-warum" onMouseUp={e => erfassen(s.id, e.currentTarget, "beschreibung")}><MarkierterText text={s.beschreibung} marke={marken[`${s.id}:beschreibung`]} /></p><div className="pl-chips"><span className="pl-chip"><Users size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />{agent ? `${agent.anbieter} · ${agent.modell}` : "Orchestrator"}</span>{agent && <span className="pl-chip"><Zap size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />{Math.round(agent.tokens / 1000)}k Tokens</span>}</div>
          </div></div>
          <div className="pl-einzug pl-feld"><div className="pl-feld-kopf">Fertig, wenn <span>{s.fertigWenn.filter(b => b.erfuellt).length} / {s.fertigWenn.length} erfüllt</span></div>
            <ul className="pl-bedingungen">{s.fertigWenn.map((b, j) => <li key={j} data-erfuellt={b.erfuellt}>{b.erfuellt ? <Check size={16} strokeWidth={1.5} absoluteStrokeWidth aria-label="Erfüllt" /> : <Circle size={16} strokeWidth={1.5} absoluteStrokeWidth aria-label="Offen" />}<span onMouseUp={e => erfassen(s.id, e.currentTarget, `bedingung${j}`)}><MarkierterText text={b.text} marke={marken[`${s.id}:bedingung${j}`]} /></span></li>)}</ul>
          </div>
          {s.markierungen.includes("Ausarbeiten") && <div className="pl-einzug pl-feld"><strong className="pl-feld-kopf">Ausgearbeitet · Beispiel</strong><ol className="pl-bedingungen"><li>Vorhandene Daten und Schnittstellen prüfen</li><li>{s.titel}</li><li>Bedingungen mit Tests und Review prüfen</li></ol></div>}
          {s.markierungen.includes("Kommentar") && <label className="pl-einzug pl-feld pl-kommentar">Dein Kommentar
            <textarea aria-label={`Kommentar zu ${s.titel}`} value={s.kommentar} placeholder="Schreib hier, was an diesem Schritt anders werden soll …" onChange={e => schrittAendern(s.id, { kommentar: e.target.value })} />
          </label>}
          <div className="pl-einzug pl-aktionen" role="group" aria-label={`Markieren: ${s.titel}`}>
            {farben.map(([name, , farbname, Symbol]) => <button type="button" key={name} style={{ "--f": farbe(name) } as CSSProperties}
              aria-label={`${name}, ${farbname}`} aria-pressed={s.markierungen.includes(name)} onClick={() => markieren(s.id, name)}><Symbol size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />{name}</button>)}
          </div>
        </li>;
      })}</ol>
    </section>
    <aside className="pl-rechts" aria-label="Plan bearbeiten"><div className="pl-werkzeuge" tabIndex={0} role="region" aria-label="Planwerkzeuge">
      <section className="pl-karte"><h3>Deine Markierungen</h3><div className="pl-stil">{farben.map(([name]) => <span className="pl-marke" key={name} style={{ "--f": farbe(name) } as CSSProperties}>{name} {plan.schritte.filter(s => s.markierungen.includes(name)).length}</span>)}</div>
        <p className="pl-hinweis">Jeder Knopf an einem Schritt färbt ihn in seiner Farbe. Mehrere Knöpfe ergeben mehrere Farben oben am Schritt.</p></section>
      <section className="pl-karte"><h3>Wie soll der Plan geschrieben sein?</h3><div className="pl-stil">{["Simpler", "Ausführlicher", "Innovativer", "Vorsichtiger", "Schneller"].map(w => <button type="button" className="pl-stilknopf" key={w} aria-pressed={stil === w} onClick={() => setStil(w)}>{w}</button>)}</div>
        <p className="pl-hinweis">Nächste Fassung wird {stil.toLocaleLowerCase("de")}.</p><Knopf text="Neu schreiben lassen" vorsatz={<RefreshCw size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />} onClick={() => setHinweis(`Beispiel: Der Plan wird ${stil.toLocaleLowerCase("de")} geschrieben.`)} /></section>
    </div><footer className="pl-fuss"><p role="status">{hinweis}</p><Knopf text="Freigeben und bauen" vorsatz={<Check size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />} variante="haupt" onClick={() => entscheiden(true)} />
      <Knopf text="Mit Kommentaren zurückgeben" onClick={() => entscheiden(false)} /></footer></aside>
  </dialog>;
}
