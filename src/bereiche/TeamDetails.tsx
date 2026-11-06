import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { FileText, X } from "lucide-react";
import { Knopf } from "../bausteine/Knopf";
import { Fortschrittsring } from "../bausteine/Fortschrittsring";
import { Statusmarke } from "../bausteine/Statusmarke";
import { Zeitspur } from "../bausteine/Zeitspur";
import type { Agent, Datenstand } from "../daten/typen";
import { orchestratorBeispiel } from "../daten/quelle";
import { spur } from "./TeamAnsichten";
import "./TeamDetails.css";

const status = { Arbeitet: "arbeitet", "Wartet auf dich": "wartet", Fertig: "fertig", Problem: "problem" } as const;
const dauer = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
export const belegFuer = (daten: Datenstand, id: string) => daten.belege.find(b => b.agentId === id && b.prLink.trim());
export const mitBeleg = (daten: Datenstand): Datenstand => ({ ...daten, agenten: daten.agenten.map(a => a.zustand === "Fertig" && !belegFuer(daten, a.id)
  ? { ...a, zustand: "Problem", liveZeile: "Beleg mit PR-Link fehlt" } : a) });

export function TeamDetails({ agent, daten, schliessen }: { agent: Agent; daten: Datenstand; schliessen: () => void }) {
  const bereich = useRef<HTMLElement>(null), [vorschau, zeige] = useState<string | null>(null);
  const vorschauBereich = useRef<HTMLElement>(null), vorschauKnopf = useRef<HTMLButtonElement>(null);
  const zustand = status[agent.zustand], beleg = belegFuer(daten, agent.id);
  const zeitspur = agent.id === "orchestrator" ? { jetzt: orchestratorBeispiel.laufzeitSekunden, phasen: [...orchestratorBeispiel.phasen] } : spur(agent);
  const ausgaben = daten.ausgaben.filter(a => a.sitzungId === agent.id);
  useLayoutEffect(() => {
    zeige(null);
    const spalte = bereich.current?.closest(".team-bereich");
    const karte = [...spalte?.querySelectorAll<HTMLElement>(`[data-agent="${agent.id}"]`) ?? []].find(el => el.getClientRects().length);
    karte?.scrollIntoView({ block: "nearest", behavior: "instant" });
    bereich.current?.focus({ preventScroll: true });
  }, [agent.id]);
  useLayoutEffect(() => { if (vorschau) { vorschauBereich.current?.scrollIntoView({ block: "nearest" }); vorschauBereich.current?.focus({ preventScroll: true }); } }, [vorschau]);
  const zu = () => {
    const knopf = [...bereich.current?.closest(".team-bereich")?.querySelectorAll<HTMLElement>(`[data-agent="${agent.id}"] [aria-expanded="true"]`) ?? []].find(el => el.getClientRects().length);
    schliessen(); knopf?.focus({ preventScroll: true });
  };
  return <aside id="team-details" ref={bereich} tabIndex={-1} className="team-details" aria-label={`Details: ${agent.name}`} style={{ "--detail-glanz": `var(--status-${zustand}-grund)` } as CSSProperties}
    onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); zu(); } }}>
    <div className="tm-det">
      <header className="tm-det-kopf"><Fortschrittsring wert={agent.zustand === "Problem" || agent.id === "orchestrator" ? undefined : agent.fortschritt} zustand={zustand} />
        <div className="tm-det-titel"><h3>{agent.name}</h3><p>{agent.anbieter} · {agent.modell}{agent.arbeitskopie && ` · Arbeitskopie ${agent.arbeitskopie}`}</p></div>
        <Knopf text="Schließen" symbol={X} nurSymbol variante="leise" onClick={zu} /></header>
      <div className="tm-det-leiste"><Statusmarke zustand={zustand} /><span>{agent.liveZeile}</span></div>
      <section className="tm-dkarte"><h4>Kennzahlen</h4><dl className="tm-zellen">{[
        ["Fortschritt", agent.id === "orchestrator" ? "–" : `${agent.fortschritt} %`], ["Laufzeit", `${dauer(agent.laufzeitSekunden)} min`],
        ["Tokens", `${(agent.tokens / 1000).toLocaleString("de-DE")}k`], ["Fertig um", agent.schaetzung ? `~${agent.schaetzung.fertigUm}` : "–"],
      ].map(([titel, wert]) => <div key={titel}><dt>{titel}</dt><dd>{wert}</dd></div>)}</dl></section>
      <div className="tm-det-raster">
        <section className="tm-dkarte"><h4>Phasen <small>Dauer in min</small></h4><Zeitspur {...zeitspur} zustand={zustand} />
          <div className="tm-phasenlegende">{zeitspur.phasen.map((p, i) => <span key={i}><i style={{ background: `var(--phase-${p.art}-verlauf)` }} />{p.name} <b>{dauer(p.ende - p.start)} min</b></span>)}</div></section>
        <section className="tm-dkarte"><h4>Tests{agent.tests?.gruenSeit && ` grün seit ${agent.tests.gruenSeit}`}</h4>
          {agent.tests ? <><progress className="tm-testplot" value={agent.tests.gruen} max={agent.tests.gesamt || 1} aria-label="Tests grün" /><p>{agent.tests.gruen} von {agent.tests.gesamt} grün{agent.tests.verlauf.some(p => p.rot) && ` · Zwischenzeitlich ${Math.max(...agent.tests.verlauf.map(p => p.rot))} rot`}</p></> : <p>Noch keine Tests</p>}</section>
        <section className="tm-dkarte"><h4>Dateien</h4><ul className="tm-dateien">{agent.dateien.map(d => <li key={d.pfad}><span><code>{d.pfad}</code><small>+{d.hinzugefuegt} −{d.entfernt}</small></span><Knopf text="Ansehen" onClick={e => { vorschauKnopf.current = e.currentTarget; zeige(d.pfad); }} /></li>)}</ul>{!agent.dateien.length && <p>Noch keine Dateien</p>}</section>
        <section className="tm-dkarte"><h4>Ausgaben</h4><ul className="tm-dateien">{ausgaben.map(a => <li key={a.id}><span>{a.name}<small>{a.pfad}</small></span><Knopf text="Ansehen" onClick={e => { vorschauKnopf.current = e.currentTarget; zeige(a.pfad); }} /></li>)}</ul>{!ausgaben.length && <p>Noch keine Ausgaben</p>}</section>
        {beleg && agent.zustand === "Fertig" && <section className="tm-dkarte tm-breit"><h4>Beleg</h4><p>{beleg.titel}</p><a href={beleg.prLink} target="_blank" rel="noreferrer">PR ansehen</a></section>}
        {vorschau && <section ref={vorschauBereich} tabIndex={-1} className="tm-dkarte tm-breit" aria-label="Vorschau" aria-live="polite"><h4><FileText size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /> Vorschau</h4><code>{vorschau}</code><p>Die Vorschau dieser Beispieldatei ist noch nicht verfügbar.</p><Knopf text="Vorschau schließen" variante="leise" onClick={() => { zeige(null); vorschauKnopf.current?.focus(); }} /></section>}
      </div>
    </div>
  </aside>;
}
