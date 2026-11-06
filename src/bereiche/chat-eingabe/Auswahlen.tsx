import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ListChecks, MessagesSquare, Play } from "lucide-react";
import { Umschalter } from "../../bausteine/Umschalter";
import { Tooltip } from "../../bausteine/Tooltip";
import { Fortschrittsring } from "../../bausteine/Fortschrittsring";
import type { Chat } from "../../daten/typen";
export const erklaerungen = ["Der Orchestrator plant, startet Agenten und meldet sich mit Ergebnissen.",
  "Der Orchestrator zeigt dir zuerst seinen Plan. Gebaut wird erst nach deiner Freigabe.",
  "Der Orchestrator stellt dir erst Fragen, bis klar ist, was du willst."];
export const modi = ["Ausführen", "Planen", "Interview"], efforts = ["Niedrig", "Mittel", "Hoch", "Sehr hoch"];

export function Modi({ wert, aendern }: { wert: string; aendern: (wert: string) => void }) {
  const ort = useRef<HTMLDivElement>(null), [tipp, setTipp] = useState(erklaerungen[0]);
  useLayoutEffect(() => { ort.current?.querySelectorAll("button").forEach((knopf, i) => {
    knopf.setAttribute("aria-description", erklaerungen[i]); knopf.removeAttribute("title");
  }); }, []);
  const zeige = (ziel: EventTarget | null) => { const knopf = (ziel as Element)?.closest("button"); if (knopf) setTipp(knopf.getAttribute("aria-description")!); };
  return <Tooltip text={tipp}><div ref={ort} onPointerOver={e => zeige(e.target)} onFocus={e => zeige(e.target)}>
    <Umschalter className="ein-modi" moeglichkeiten={modi} wert={wert} beschriftung="Modus" onChange={aendern}
      symbole={[Play, ListChecks, MessagesSquare].map((Icon, i) => <Icon key={i} size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />)} />
  </div></Tooltip>;
}
export function EffortSymbol({ wert }: { wert: string }) {
  return <span className="effort-stufen" aria-hidden="true">{efforts.map((_, i) => <span key={i} data-an={i <= efforts.indexOf(wert)} style={{ height: `${(i + 1) * 25}%` }} />)}</span>;
}
export function Auswahl({ name, wert, werte, aendern, children, fest = false }: {
  name: string; wert: string; werte: string[]; aendern: (wert: string) => void; children: ReactNode; fest?: boolean;
}) {
  const [offen, setOffen] = useState(false), ort = useRef<HTMLDivElement>(null), knopf = useRef<HTMLButtonElement>(null);
  const rueckgabe = useRef(false);
  const zu = (fokus = false) => { rueckgabe.current = fokus; setOffen(false); };
  useLayoutEffect(() => { if (!offen && rueckgabe.current) { rueckgabe.current = false; knopf.current?.focus(); } }, [offen]);
  const fokus = (i: number) => ort.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]")[(i + werte.length) % werte.length]?.focus();
  useEffect(() => {
    if (!offen) return;
    fokus(Math.max(0, werte.findIndex(w => wert === w || wert.endsWith(`· ${w}`))));
    const daneben = (e: PointerEvent) => { if (!ort.current?.contains(e.target as Node)) zu(); };
    document.addEventListener("pointerdown", daneben); return () => document.removeEventListener("pointerdown", daneben);
  }, [offen]); // Die Auswahl bleibt bis zur Bestätigung unverändert.
  const ausloeser = <button type="button" className="kn kn-zweit"
      ref={knopf} aria-label={name === "Kontext" ? wert : `${name}: ${wert}`} aria-haspopup={fest ? undefined : "menu"} aria-expanded={fest ? undefined : offen}
      onClick={() => { if (!fest) { if (offen) zu(true); else setOffen(true); } }} onKeyDown={e => { if (!fest && ["ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); setOffen(true); } }}>
      {children}{!fest && <ChevronDown className="pfeil" size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />}
    </button>;
  return <div className="ein-auswahl" ref={ort} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) zu(); }}>
    {offen ? <span className="tt-ausloeser">{ausloeser}</span> : <Tooltip text={name === "Kontext" ? wert : `${name}: ${wert}`}>{ausloeser}</Tooltip>}
    {offen && <div className="ein-menue" role="menu" aria-label={name} onKeyDown={e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); zu(true); }
      if (e.key === "Tab") setTimeout(() => zu(document.activeElement === knopf.current), 0);
      const i = [...e.currentTarget.querySelectorAll("button")].indexOf(document.activeElement as HTMLButtonElement);
      const ziel = e.key === "Home" ? 0 : e.key === "End" ? werte.length - 1 : e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : null;
      if (ziel !== null) { e.preventDefault(); fokus(ziel); }
    }}>{werte.map(w => <button type="button" role="menuitemradio" tabIndex={-1} aria-checked={wert === w || wert.endsWith(`· ${w}`)} key={w}
      onClick={() => { aendern(w); zu(true); }}>{w}</button>)}</div>}
  </div>;
}
export function Kontext({ chat, aendern }: { chat: Chat; aendern: (werte: Partial<Chat>) => void }) {
  const fenster = chat.kontextfenster === 1000000 ? "1M" : "256k", prozent = Number.isFinite(chat.kontextProzent) ? `${Math.round(chat.kontextProzent)} %` : "–";
  return <Auswahl name="Kontext" wert={`Kontext ${prozent} · ${fenster}`} werte={["256k", "1M"]} fest={chat.modell !== "Opus 5.5"}
    aendern={w => aendern({ kontextfenster: w === "1M" ? 1000000 : 256000 })}>
    <span className="wort">Kontext</span>{" "}<Fortschrittsring wert={chat.kontextProzent} groesse={20} zustand="kontext" />
    <span className="kontext-prozent">{prozent}<span className="wort-punkt"> ·</span></span>{" "}{fenster}
  </Auswahl>;
}
