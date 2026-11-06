import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Umschalter } from "../../bausteine/Umschalter";
import { Tooltip } from "../../bausteine/Tooltip";
import { modusEinstellungen } from "../../daten/beispiel";
import "./Einstellungen.css";

export function Einstellungen({ modus }: { modus: string }) {
  const [werte, setWerte] = useState<Record<string, string[]>>({}), [offen, setOffen] = useState(false);
  const ort = useRef<HTMLSpanElement>(null), knopf = useRef<HTMLButtonElement>(null), rueckgabe = useRef(false), id = useId();
  const zeilen = modusEinstellungen[modus as keyof typeof modusEinstellungen];
  const aktuell = werte[modus] ?? zeilen?.map(z => z.empfohlen) ?? [];
  const empfohlen = zeilen?.every((z, i) => aktuell[i] === z.empfohlen) ?? true;
  const zu = () => { rueckgabe.current = true; setOffen(false); };
  useLayoutEffect(() => { if (!offen && rueckgabe.current) { rueckgabe.current = false; knopf.current?.focus(); } }, [offen]);
  useEffect(() => { setOffen(false); }, [modus]);
  useEffect(() => {
    if (!offen) return;
    ort.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const daneben = (e: MouseEvent) => { if (!e.composedPath().includes(ort.current!)) zu(); };
    document.addEventListener("click", daneben); return () => document.removeEventListener("click", daneben);
  }, [offen]);
  if (!zeilen) return null;
  const ausloeser = <button type="button" className="kn kn-leise" ref={knopf} aria-haspopup="dialog" aria-expanded={offen}
    aria-controls={offen ? id : undefined} aria-label={`Einstellungen für ${modus}: ${empfohlen ? "Empfohlen" : "Angepasst"}`}
    onClick={() => offen ? zu() : setOffen(true)} onKeyDown={e => {
      if (["ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); setOffen(true); }
    }}><SlidersHorizontal size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
    <span className="einst-wort">{empfohlen ? "Empfohlen" : "Angepasst"}</span>
    <ChevronDown className="einst-pfeil" size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /></button>;
  return <span className="einst-gruppe"><span className="trenner" aria-hidden="true" /><span className="einst-anker" ref={ort}>
    {offen ? <span className="tt-ausloeser">{ausloeser}</span> : <Tooltip text={`Einstellungen für ${modus}`}>{ausloeser}</Tooltip>}
    {offen && <div className="ein-einst" role="dialog" aria-label={`Einstellungen für ${modus}`} id={id} onKeyDownCapture={e => {
      if (["Escape", "Tab"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); zu(); return; }
      const teile = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=radio][aria-checked=true], button.kn:not(:disabled)')];
      const i = teile.indexOf(document.activeElement as HTMLButtonElement);
      const ziel = e.key === "Home" ? 0 : e.key === "End" ? teile.length - 1 : e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : null;
      if (ziel !== null) { e.preventDefault(); e.stopPropagation(); teile[(ziel + teile.length) % teile.length]?.focus(); }
    }}>
      <span className="titel"><b>{modus}</b><span>Gilt für neue Aufträge in diesem Modus.</span></span>
      {zeilen.map((z, i) => <div className="zeile" key={z.name}><span className="kopf"><span>{z.name}</span>
        <span className="empf">Empfohlen: {z.empfohlen}</span></span>
        <Umschalter beschriftung={z.name} moeglichkeiten={z.werte} wert={aktuell[i]} onChange={wert =>
          setWerte(vorher => ({ ...vorher, [modus]: aktuell.map((w, n) => n === i ? wert : w) }))} /></div>)}
      <span><button type="button" className="kn kn-leise einst-zurueck" disabled={empfohlen}
        onClick={() => { setWerte(vorher => ({ ...vorher, [modus]: zeilen.map(z => z.empfohlen) }));
          ort.current?.querySelector<HTMLButtonElement>(`[aria-label="${zeilen[0].empfohlen}"]`)?.focus(); }}>Auf Empfohlen zurücksetzen</button></span>
    </div>}
  </span></span>;
}
